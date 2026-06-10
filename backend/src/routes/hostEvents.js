// Host event CRUD routes: read single event, co-host management + invitations,
// waitlist links, VIP invites, update, publish, delete, duplicate.

import {
  createEvent,
  findEventBySlug,
  findEventById,
  updateEvent,
  pickEventFields,
  findRsvpById,
  updateRsvp,
  getUserProfile,
  isUserEventHost,
  isUserEventOwner,
  canManageHosts,
  canEditEvent,
  getEventHostRole,
  HOST_ROLES,
  findPersonById,
  createEventHostInvitation,
  getPendingInvitationsForEvent,
  createVipInvite,
  updateVipInvite,
  getVipInvitesForEvent,
  deleteEvent,
} from "../data.js";
import { requireAuth } from "../middleware/auth.js";
import { validateEventData } from "../middleware/validation.js";
import { processHostedByLogos } from "../services/hostedByLogos.js";
import { isDevelopment, getFrontendUrl } from "../lib/urls.js";
import { logger } from "../logger.js";
import {
  sendEmail,
  coHostAddedEmailBody,
  coHostInvitedEmailBody,
  coHostAddedEmailHtml,
  coHostInvitedEmailHtml,
} from "../services/emailService.js";
import {
  signupConfirmationEmail,
  waitlistOfferEmail,
} from "../emails/signupConfirmation.js";
import { generateWaitlistToken } from "../utils/waitlistTokens.js";
import { emitIntent, sourceFromRequest } from "../services/intentLog.js";
import { dispatch as dispatchMessage } from "../messaging/index.js";

// Build full host list for an event: owner first (from events.host_id), then event_hosts. Owner is never removable.
async function getHostsForEvent(event) {
  const { supabase } = await import("../supabase.js");

  async function enrichHost(userId, role, createdAt = null) {
    try {
      const profile = await getUserProfile(userId);
      let email = null;
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.admin.getUserById(userId);
        if (!userError && user) {
          email = user.email || null;
        } else if (userError) {
          console.error("Error fetching auth user for host:", userId, userError);
        }
      } catch (authErr) {
        console.error("Unexpected error fetching auth user for host:", userId, authErr);
      }
      return {
        userId,
        email,
        role: role || "co_host",
        createdAt,
        profile,
      };
    } catch (err) {
      console.error("Error fetching profile for host:", userId, err);
      return {
        userId,
        email: null,
        role: role || "co_host",
        createdAt,
        profile: null,
      };
    }
  }

  const hosts = [];

  if (event.hostId) {
    const ownerHost = await enrichHost(event.hostId, "owner", null);
    hosts.push(ownerHost);
  }

  const { data: hostRows, error } = await supabase
    .from("event_hosts")
    .select("id, event_id, user_id, role, created_at")
    .eq("event_id", event.id)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "PGRST205") return hosts; // table missing
    throw error;
  }

  for (const row of hostRows || []) {
    if (row.user_id === event.hostId) continue;
    const enriched = await enrichHost(row.user_id, row.role, row.created_at);
    hosts.push(enriched);
  }

  return hosts;
}

export function registerHostEventRoutes(app) {
// ---------------------------
// PROTECTED: Get single event by id or slug (requires auth, verifies ownership)
// ---------------------------
app.get("/host/events/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Try to find by ID first (UUID format)
    let event = await findEventById(id);

    // If not found by ID, try to find by slug
    if (!event) {
      event = await findEventBySlug(id);
    }

    if (!event) return res.status(404).json({ error: "Event not found" });

    // Verify access (any host role). Admins can also view any event read-only —
    // they reach this through the admin Analytics → All Events tab. We surface
    // them with the "analytics" role so the event nav shows only the Analytics
    // tab (no Edit/Guests they couldn't act on anyway).
    const { isHost } = await isUserEventHost(req.user.id, event.id);
    let adminView = false;
    if (!isHost) {
      const profile = await getUserProfile(req.user.id);
      adminView = !!profile?.isAdmin;
    }
    if (!isHost && !adminView) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
      });
    }

    const myRole = isHost
      ? await getEventHostRole(req.user.id, event.id)
      : "analytics";
    res.json({ ...event, myRole });
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

// ---------------------------
// PROTECTED: Manage event hosts (arrangers)
// ---------------------------


// List hosts for an event
app.get("/host/events/:id/hosts", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const event = await findEventById(id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const { isHost } = await isUserEventHost(req.user.id, event.id);
    if (!isHost) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You don't have access to this event",
      });
    }

    const hosts = await getHostsForEvent(event);
    const pendingInvitations = await getPendingInvitationsForEvent(event.id).catch(() => []);
    res.json({ hosts, pendingInvitations });
  } catch (error) {
    console.error("Error listing event hosts:", error);
    if (error.code === "PGRST205") {
      return res.json({ hosts: [] });
    }
    res.status(500).json({ error: "Failed to list event hosts" });
  }
});

// Add a host to an event (owner or admin).
// If the email has an account: add to event_hosts and send "added" email.
// If not: create pending invitation and send "invited" email (they'll see the event when they sign up).
app.post("/host/events/:id/hosts", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId: rawUserId, email, role = "editor" } = req.body || {};

    const event = await findEventById(id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const { isHost } = await isUserEventHost(req.user.id, event.id);
    if (!isHost || !(await canManageHosts(req.user.id, event.id))) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only the event owner or admin can add hosts",
      });
    }

    const allowedRoles = [
      HOST_ROLES.ADMIN,
      HOST_ROLES.EDITOR,
      HOST_ROLES.RECEPTION,
      HOST_ROLES.ANALYTICS,
      HOST_ROLES.VIEWER,
    ];
    const roleToInsert =
      role && allowedRoles.includes(role) ? role : HOST_ROLES.EDITOR;

    let userId = rawUserId;

    if (!userId && email) {
      const normalizedEmail = String(email).trim().toLowerCase();

      try {
        const { supabase } = await import("../supabase.js");

        const {
          data: { users },
          error: authError,
        } = await supabase.auth.admin.listUsers();

        if (authError) {
          console.error("Error listing auth users:", authError);
        } else if (users && users.length > 0) {
          const matchingUser = users.find(
            (u) => u.email?.toLowerCase() === normalizedEmail
          );
          if (matchingUser?.id) userId = matchingUser.id;
        }

        if (!userId) {
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("id, additional_emails")
            .contains("additional_emails", [normalizedEmail])
            .maybeSingle();

          if (!profileError && profile?.id) userId = profile.id;
        }
      } catch (lookupError) {
        console.error("Error looking up user by email:", lookupError);
        return res.status(500).json({
          error: "user_lookup_failed",
          message: "Failed to look up user by email",
        });
      }
    }

    if (userId) {
      // User exists: add to event_hosts and send "added" email
      const { supabase } = await import("../supabase.js");
      const { error } = await supabase.from("event_hosts").insert({
        event_id: event.id,
        user_id: userId,
        role: roleToInsert,
      });

      if (error) {
        if (error.code === "23505") {
          return res.status(400).json({
            error: "already_host",
            message: "This user is already an arranger for this event",
          });
        }
        if (error.code === "PGRST205") {
          return res.status(400).json({
            error: "hosts_not_enabled",
            message:
              "Hosts feature is not enabled in this environment yet (missing event_hosts table).",
          });
        }
        console.error("Error adding event host:", error);
        return res.status(500).json({ error: "Failed to add event host" });
      }

      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.admin.getUserById(userId);
        const toEmail = authUser?.email;
        if (toEmail) {
          await sendEmail({
            to: toEmail,
            subject: `You've been added as ${roleToInsert} to "${event.title}"`,
            html: coHostAddedEmailHtml({
              eventTitle: event.title,
              role: roleToInsert,
              imageUrl: event.coverImageUrl || event.imageUrl || "",
              slug: event.slug || "",
            }),
            text: coHostAddedEmailBody({
              eventTitle: event.title,
              role: roleToInsert,
            }),
          });
        }
      } catch (emailErr) {
        console.error("Failed to send co-host added email:", emailErr.message);
      }

      const hosts = await getHostsForEvent(event);
      const pendingInvitations = await getPendingInvitationsForEvent(event.id).catch(() => []);
      return res.status(201).json({ hosts, pendingInvitations });
    }

    // No account yet: create pending invitation and send "invited" email
    if (!email) {
      return res.status(400).json({
        error: "email_required",
        message: "Email is required to invite someone who doesn't have an account yet",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    try {
      await createEventHostInvitation({
        eventId: event.id,
        email: normalizedEmail,
        role: roleToInsert,
        invitedByUserId: req.user.id,
      });
    } catch (invErr) {
      if (invErr.code === "23505") {
        return res.status(400).json({
          error: "already_invited",
          message: "This email has already been invited to this event",
        });
      }
      console.error("Error creating invitation:", invErr);
      return res.status(500).json({ error: "Failed to create invitation" });
    }

    try {
      await sendEmail({
        to: normalizedEmail,
        subject: `You're invited to co-host "${event.title}"`,
        html: coHostInvitedEmailHtml({
          eventTitle: event.title,
          role: roleToInsert,
          imageUrl: event.coverImageUrl || event.imageUrl || "",
          slug: event.slug || "",
        }),
        text: coHostInvitedEmailBody({
          eventTitle: event.title,
          role: roleToInsert,
        }),
      });
    } catch (emailErr) {
      console.error("Failed to send co-host invitation email:", emailErr.message);
    }

    const hosts = await getHostsForEvent(event);
    const pendingInvitations = await getPendingInvitationsForEvent(event.id).catch(() => []);
    return res.status(201).json({ hosts, pendingInvitations });
  } catch (error) {
    console.error("Error adding event host:", error);
    res.status(500).json({ error: "Failed to add event host" });
  }
});

// Revoke a pending co-host invitation (owner or admin)
app.delete(
  "/host/events/:eventId/invitations/:email",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, email } = req.params;
      const normalizedEmail = decodeURIComponent(email).trim().toLowerCase();

      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost || !(await canManageHosts(req.user.id, event.id))) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Only the event owner or admin can revoke invitations",
        });
      }

      const { supabase } = await import("../supabase.js");
      const { error } = await supabase
        .from("event_host_invitations")
        .delete()
        .eq("event_id", event.id)
        .eq("email", normalizedEmail)
        .eq("status", "pending");

      if (error) {
        if (error.code === "PGRST205") return res.status(404).json({ error: "Not found" });
        return res.status(500).json({ error: "Failed to revoke invitation" });
      }

      const hosts = await getHostsForEvent(event);
      const pendingInvitations = await getPendingInvitationsForEvent(event.id).catch(() => []);
      return res.json({ hosts, pendingInvitations });
    } catch (err) {
      console.error("Error revoking invitation:", err);
      res.status(500).json({ error: "Failed to revoke invitation" });
    }
  }
);

// Remove a host from an event (owner only)
app.delete(
  "/host/events/:eventId/hosts/:userId",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, userId } = req.params;

      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const { isHost, role: currentRole } = await isUserEventHost(
        req.user.id,
        event.id
      );
      if (!isHost || !(await canManageHosts(req.user.id, event.id))) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Only the event owner or admin can remove hosts",
        });
      }

      const { supabase } = await import("../supabase.js");
      const { error } = await supabase
        .from("event_hosts")
        .delete()
        .eq("event_id", event.id)
        .eq("user_id", userId);

      if (error) {
        console.error("Error deleting event host:", error);
        return res.status(500).json({ error: "Failed to delete event host" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting event host:", error);
      res.status(500).json({ error: "Failed to delete event host" });
    }
  }
);

// Update a host's role (owner or admin only). Only non-owner hosts can be updated.
app.patch(
  "/host/events/:eventId/hosts/:userId",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, userId } = req.params;
      const { role } = req.body || {};

      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost || !(await canManageHosts(req.user.id, event.id))) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Only the event owner or admin can update host roles",
        });
      }

      const allowedRoles = [
        HOST_ROLES.ADMIN,
        HOST_ROLES.EDITOR,
        HOST_ROLES.RECEPTION,
        HOST_ROLES.ANALYTICS,
        HOST_ROLES.VIEWER,
      ];
      if (!role || !allowedRoles.includes(role)) {
        return res.status(400).json({
          error: "Invalid role",
          message: "Role must be one of: admin, editor, reception, analytics, viewer",
        });
      }

      // Cannot change owner's role (owner is from events.host_id, not in event_hosts for this event's owner)
      if (event.hostId === userId) {
        return res.status(400).json({
          error: "Cannot change owner role",
          message: "Event owner role cannot be changed",
        });
      }

      const { supabase } = await import("../supabase.js");
      const { data, error } = await supabase
        .from("event_hosts")
        .update({ role })
        .eq("event_id", event.id)
        .eq("user_id", userId)
        .select()
        .maybeSingle();

      if (error) {
        console.error("Error updating event host role:", error);
        return res.status(500).json({ error: "Failed to update host role" });
      }
      if (!data) {
        return res.status(404).json({
          error: "Host not found",
          message: "No host record found for this user on this event",
        });
      }

      const hosts = await getHostsForEvent(event);
      res.json({ hosts });
    } catch (error) {
      console.error("Error updating event host role:", error);
      res.status(500).json({ error: "Failed to update host role" });
    }
  }
);
// ---------------------------
app.post(
  "/host/events/:eventId/waitlist-link/:rsvpId",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, rsvpId } = req.params;

      // Verify host owns event
      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Verify RSVP exists and is WAITLIST
      const rsvp = await findRsvpById(rsvpId);
      if (!rsvp) {
        return res.status(404).json({ error: "RSVP not found" });
      }

      if (rsvp.bookingStatus !== "WAITLIST") {
        return res.status(400).json({
          error: "RSVP is not on waitlist",
          message: "Only waitlisted RSVPs can have links generated",
        });
      }

      const isFreeEvent = event.ticketType !== "paid" || !event.ticketPrice;

      // Verify RSVP belongs to this event
      if (rsvp.eventId !== eventId) {
        return res.status(400).json({
          error: "RSVP mismatch",
          message: "RSVP does not belong to this event",
        });
      }

      // Get person email
      const person = await findPersonById(rsvp.personId);
      if (!person || !person.email) {
        return res.status(400).json({
          error: "Person email not found",
          message: "Cannot generate link without email address",
        });
      }

      const frontendUrl = getFrontendUrl();

      // Fetch host branding for email footers + WhatsApp signature.
      const promoteHost = await getUserProfile(event.hostId).catch(() => null);
      const hostBrand = {
        brandName: promoteHost?.brand || "",
        brandWebsite: promoteHost?.brandWebsite || "",
        contactEmail: promoteHost?.contactEmail || "",
      };

      // FREE EVENTS: Immediately confirm the guest (no payment needed)
      if (isFreeEvent) {
        await updateRsvp(rsvpId, {
          bookingStatus: "CONFIRMED",
          status: "attending",
        }, { forceConfirm: true });

        // Confirmed off the waitlist — same dual-rail as a fresh RSVP confirm,
        // so a verified + opted-in guest gets WhatsApp (email is the floor).
        try {
          const firstName = (rsvp.name || person.name || "there").split(/\s+/)[0] || "there";
          const promoteSig =
            promoteHost?.whatsappSignature ||
            (promoteHost?.name ? `It's me, ${promoteHost.name.split(/\s+/)[0]}` : "");
          await dispatchMessage({
            recipient: {
              id: person.id || null,
              email: person.email,
              phone_e164: person.phone_e164 || null,
              phone_verified_at: person.phone_verified_at || null,
              do_not_contact: person.do_not_contact || false,
            },
            hostProfile: promoteHost,
            whatsapp: {
              templateKey: "rsvp_confirm",
              variables: {
                guest_first_name: firstName,
                event_title: event.title || "the event",
                event_when: event.startsAt ? new Date(event.startsAt).toLocaleString() : "soon",
                host_signature: promoteSig || "PullUp",
              },
            },
            email: {
              subject: "Your spot is confirmed",
              htmlBody: signupConfirmationEmail({
                name: rsvp.name || person.name || "there",
                eventTitle: event.title,
                date: event.startsAt ? new Date(event.startsAt).toLocaleString() : "",
                isWaitlist: false,
                imageUrl: event.coverImageUrl || event.imageUrl || "",
                location: event.location || "",
                locationLat: event.locationLat ?? null,
                locationLng: event.locationLng ?? null,
                startsAt: event.startsAt || "",
                endsAt: event.endsAt || "",
                timezone: event.timezone || "",
                plusOnes: Number(rsvp.plusOnes) || 0,
                slug: event.slug || "",
                frontendUrl,
                spotifyUrl: event.spotify || "",
                hideDate: event.hideDate || false,
                hideLocation: event.hideLocation || false,
                dateRevealHint: event.dateRevealHint || "",
                revealHint: event.revealHint || "",
                ...hostBrand,
                // Event's own brand snapshot (migration 047): backgroundColor →
                // canvas, buttonColor → accent/button. {} → PullUp default.
                brand: event.brand
                  ? {
                      background:   event.brand.backgroundColor || null,
                      primaryColor: event.brand.buttonColor || null,
                    }
                  : {},
              }),
            },
            context: {
              personId: person.id || null,
              hostProfileId: event.hostId || null,
            },
          });
        } catch (emailErr) {
          console.error("Failed to send confirmation email:", emailErr);
        }

        return res.json({
          link: null,
          token: null,
          expiresAt: null,
          email: person.email,
          isFreeEvent: true,
          promoted: true,
          emailSent: true,
        });
      }

      // PAID EVENTS: Generate payment link for the guest
      // Host can set custom expiry (in minutes), otherwise smart default
      const { expiresInMinutes: customMinutes } = req.body || {};
      let expiresAt;
      if (customMinutes && Number(customMinutes) > 0) {
        expiresAt = new Date(Date.now() + Number(customMinutes) * 60 * 1000);
      } else {
        // Smart default based on time until event
        const now = Date.now();
        const eventStart = event.startsAt ? new Date(event.startsAt).getTime() : null;
        const minutesUntilEvent = eventStart ? (eventStart - now) / (60 * 1000) : null;

        if (minutesUntilEvent === null || minutesUntilEvent > 24 * 60) {
          // No start time or > 24h away: 6 hours
          expiresAt = new Date(now + 6 * 60 * 60 * 1000);
        } else if (minutesUntilEvent > 6 * 60) {
          // 6-24h away: 2h before event
          expiresAt = new Date(eventStart - 2 * 60 * 60 * 1000);
        } else if (minutesUntilEvent > 2 * 60) {
          // 2-6h away: 1h before event
          expiresAt = new Date(eventStart - 1 * 60 * 60 * 1000);
        } else {
          // < 2h away or already started: 30 minutes (urgent)
          expiresAt = new Date(now + 30 * 60 * 1000);
        }
      }
      const token = generateWaitlistToken({
        type: "waitlist_offer",
        eventId: event.id,
        rsvpId: rsvp.id,
        email: person.email.toLowerCase(),
        expiresAt: expiresAt.toISOString(),
        rsvpDetails: {
          name: rsvp.name || person.name || null,
          email: person.email.toLowerCase(),
          plusOnes: rsvp.plusOnes || 0,
          partySize: rsvp.partySize || 1,
          wantsDinner: rsvp.wantsDinner || false,
          dinnerTimeSlot: rsvp.dinnerTimeSlot || null,
          dinnerPartySize: rsvp.dinnerPartySize || null,
        },
      });

      // Update RSVP with link generation timestamp
      await updateRsvp(rsvpId, {
        waitlistLinkGeneratedAt: new Date().toISOString(),
        waitlistLinkExpiresAt: expiresAt.toISOString(),
        waitlistLinkToken: token,
      });

      const link = `${frontendUrl}/e/${event.slug}?wl=${token}`;

      // Send waitlist offer email with payment link
      try {
        // Dual-rail: a freed spot is urgent + time-boxed — WhatsApp is the right
        // rail when we have a verified number; email is the floor. The claim link
        // rides in the template body (no button-param dependency).
        const offerHostProfile = await getUserProfile(event.hostId).catch(() => null);
        await dispatchMessage({
          recipient: {
            id: person.id || null,
            email: person.email,
            phone_e164: person.phone_e164 || null,
            phone_verified_at: person.phone_verified_at || null,
            do_not_contact: person.do_not_contact || false,
          },
          hostProfile: offerHostProfile,
          whatsapp: {
            templateKey: "waitlist_promotion",
            variables: {
              guest_first_name: (rsvp.name || person.name || "there").split(/\s+/)[0] || "there",
              event_title: event.title || "the event",
              link,
            },
          },
          email: {
            subject: "A spot has opened up!",
            htmlBody: waitlistOfferEmail({
              name: rsvp.name || person.name || "there",
              eventTitle: event.title,
              imageUrl: event.coverImageUrl || event.imageUrl || "",
              location: event.location || "",
              locationLat: event.locationLat ?? null,
              locationLng: event.locationLng ?? null,
              startsAt: event.startsAt || "",
              endsAt: event.endsAt || "",
              timezone: event.timezone || "",
              plusOnes: Number(rsvp.plusOnes) || 0,
              slug: event.slug || "",
              frontendUrl,
              offerLink: link,
              isPaidEvent: true,
              expiresInMinutes: Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / (60 * 1000))),
              hideDate: event.hideDate || false,
              hideLocation: event.hideLocation || false,
              dateRevealHint: event.dateRevealHint || "",
              revealHint: event.revealHint || "",
              ...hostBrand,
              brand: event.brand
                ? {
                    background:   event.brand.backgroundColor || null,
                    primaryColor: event.brand.buttonColor || null,
                  }
                : {},
            }),
          },
          context: {
            personId: person.id || null,
            hostProfileId: event.hostId || null,
            idempotencyKey: `wl-offer-${rsvpId}-${expiresAt.getTime()}`,
          },
        });
      } catch (emailErr) {
        console.error("Failed to send waitlist offer email:", emailErr);
      }

      return res.json({
        link,
        token,
        expiresAt: expiresAt.toISOString(),
        email: person.email,
        isFreeEvent: false,
        emailSent: true,
      });
    } catch (error) {
      console.error("Error generating waitlist link:", error);
      res.status(500).json({
        error: "Failed to generate waitlist link",
        message: error.message,
      });
    }
  }
);

// ---------------------------
// PROTECTED: Create VIP invite (requires auth, verifies ownership)
// ---------------------------
app.post(
  "/host/events/:eventId/vip-invites",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId } = req.params;
      const {
        email,
        maxGuests = 1,
        freeEntry = false,
        discountPercent = null,
      } = req.body || {};

      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Valid email is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ error: "Valid email is required" });
      }

      const maxGuestsInt =
        typeof maxGuests === "number"
          ? Math.max(1, Math.floor(maxGuests))
          : 1;

      // Verify event exists
      const event = await findEventById(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Verify user is a host for this event
      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const eventIsPaid =
        event.ticketType === "paid" && event.ticketPrice && event.ticketPrice > 0;
      const effectiveFreeEntry = eventIsPaid && !!freeEntry;

      // Compute expiration: default to event start time; fallback to +48h from now
      let expiresAt = null;
      if (event.startsAt) {
        const start = new Date(event.startsAt);
        if (!isNaN(start.getTime())) {
          expiresAt = start;
        }
      }
      if (!expiresAt) {
        expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      }

      // Create invite record (without token first)
      const invite = await createVipInvite({
        eventId: event.id,
        email: normalizedEmail,
        maxGuests: maxGuestsInt,
        freeEntry: effectiveFreeEntry,
        discountPercent:
          typeof discountPercent === "number" ? discountPercent : null,
        expiresAt: expiresAt.toISOString(),
        token: null,
      });

      // Generate signed token
      const token = generateWaitlistToken({
        type: "vip_invite",
        inviteId: invite.id,
        eventId: event.id,
        email: normalizedEmail,
        maxGuests: maxGuestsInt,
        freeEntry: effectiveFreeEntry,
        discountPercent:
          typeof discountPercent === "number" ? discountPercent : null,
        expiresAt: expiresAt.toISOString(),
      });

      // Store token on invite (best-effort)
      await updateVipInvite(invite.id, { token });

      const frontendUrl = getFrontendUrl();
      const link = `${frontendUrl}/e/${event.slug}?vip=${token}`;

      // Load host profile for contact info
      let hostProfile = null;
      try {
        hostProfile = await getUserProfile(req.user.id);
      } catch (e) { /* ignore */ }
      const hostContactEmail = hostProfile?.contactEmail || null;
      const hostBrandWebsite = hostProfile?.brandWebsite || null;
      const hostBrandName = hostProfile?.brand || null;

      // Send VIP link via email to the guest
      try {
        const niceDate = expiresAt.toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        });

        // Format event date nicely
        const eventDate = event.startsAt ? (() => {
          const d = new Date(event.startsAt);
          if (isNaN(d.getTime())) return "";
          const opts = event.timezone ? { timeZone: event.timezone } : {};
          const datePart = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", ...opts });
          const timePart = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", ...opts });
          return `${datePart} · ${timePart}`;
        })() : "";

        const subject = `You're on the VIP list`;

        // Plaintext version
        const textParts = [`You've been invited as a VIP to "${event.title}".`];
        if (eventDate) textParts.push(`When: ${eventDate}`);
        if (event.location) textParts.push(`Where: ${event.location}`);
        if (maxGuestsInt > 1) textParts.push(`You can bring up to ${maxGuestsInt - 1} guest${maxGuestsInt > 2 ? "s" : ""}.`);
        if (effectiveFreeEntry) textParts.push("Your entry is complimentary.");
        if (event.description) textParts.push("", event.description.slice(0, 300));
        textParts.push("", `RSVP here: ${link}`, "", `Valid until ${niceDate}.`);
        if (hostContactEmail) textParts.push(`Questions? ${hostContactEmail}`);
        if (hostBrandWebsite) textParts.push(hostBrandWebsite);
        const textBody = textParts.join("\n");

        // Build rich HTML email
        const imageUrl = event.coverImageUrl || event.imageUrl || "";
        const desc = event.description
          ? event.description.length > 200
            ? event.description.slice(0, 200).trimEnd() + "…"
            : event.description
          : "";
        const spotifyUrl = event.spotify || "";
        const plusOnesText = maxGuestsInt > 1
          ? `You + ${maxGuestsInt - 1} guest${maxGuestsInt > 2 ? "s" : ""}`
          : "You";
        const freeEntryBadge = effectiveFreeEntry
          ? `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);color:#fbbf24;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-left:8px;">COMP</span>`
          : "";

        const htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
<body style="margin:0;padding:0;background:#05040a;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:#05040a;">
<tr><td align="center" style="padding:20px 16px;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:#05040a;">

<!-- VIP Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  <span style="display:inline-block;padding:6px 20px;border-radius:999px;background:linear-gradient(135deg,#fbbf24 0%,#f59e0b 45%,#d97706 100%);color:#05040a;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">VIP INVITE</span>
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0 0 0;">
  <img src="${imageUrl}" alt="${event.title.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 translate="no" class="notranslate" style="margin:0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.3;">${event.title}</h1>
</td></tr>

<!-- Date & Location -->
<tr><td align="center" style="padding:8px 0;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation">
  ${eventDate ? `<tr><td style="padding:3px 0;font-size:14px;color:rgba(255,255,255,0.6);text-align:center;">${eventDate}</td></tr>` : ""}
  ${event.location ? `<tr><td style="padding:3px 0;font-size:14px;color:rgba(255,255,255,0.6);text-align:center;">${event.location}</td></tr>` : ""}
  </table>
</td></tr>

${desc ? `<!-- Description -->
<tr><td style="padding:12px 20px;text-align:center;">
  <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.7);line-height:1.6;">${desc.replace(/\n/g, "<br>")}</p>
</td></tr>` : ""}

<!-- Guest info -->
<tr><td align="center" style="padding:16px 0 4px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
    <tr>
      <td style="padding:12px 20px;font-size:13px;color:rgba(255,255,255,0.8);text-align:center;">
        <strong>${plusOnesText}</strong>${freeEntryBadge}
      </td>
    </tr>
  </table>
</td></tr>

${spotifyUrl ? `<!-- Spotify -->
<tr><td align="center" style="padding:12px 0;">
  <a href="${spotifyUrl}" target="_blank" style="display:inline-flex;align-items:center;text-decoration:none;padding:8px 16px;border-radius:999px;background:rgba(30,215,96,0.12);border:1px solid rgba(30,215,96,0.3);color:#1ed760;font-size:13px;font-weight:600;">
    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Spotify_icon.svg/232px-Spotify_icon.svg.png" alt="" width="16" height="16" style="border:0;margin-right:6px;vertical-align:middle;" />Listen on Spotify
  </a>
</td></tr>` : ""}

<!-- CTA Button -->
<tr><td align="center" style="padding:24px 0;">
  <a href="${link}" target="_blank" style="display:inline-block;text-decoration:none;padding:14px 36px;border-radius:999px;background-color:#f59e0b;background-image:linear-gradient(135deg,#fbbf24 0%,#f59e0b 45%,#d97706 100%);color:#05040a;font-size:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border:1px solid rgba(245,158,11,0.9);">GET VIP ACCESS</a>
</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 0 8px;border-top:1px solid rgba(255,255,255,0.06);">
  <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);text-align:center;line-height:1.6;">
    This invite is valid until ${niceDate}.<br>
    ${hostContactEmail ? `Questions? <a href="mailto:${hostContactEmail}" style="color:rgba(255,255,255,0.4);text-decoration:none;">${hostContactEmail}</a><br>` : ""}
    ${hostBrandWebsite ? `<a href="${hostBrandWebsite}" target="_blank" style="color:rgba(255,255,255,0.4);text-decoration:none;">${hostBrandWebsite.replace(/^https?:\/\//, "")}</a>` : `<a href="${getFrontendUrl()}" target="_blank" style="color:rgba(255,255,255,0.4);text-decoration:none;">pullup.se</a>`}
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`;

        const senderName = event.title.replace(/"/g, "");
        const outboxRow = await sendEmail({
          to: normalizedEmail,
          // Cold invite: no person node yet, but host context makes it
          // repliable — a reply resolves the sender's address at thread time.
          hostProfileId: event.hostId || null,
          subject,
          text: textBody,
          html: htmlBody,
          from: `"${senderName} VIP" <no-reply@pullup.se>`,
        });

        // Apply email tracking (open pixel + click redirect links)
        if (outboxRow?.tracking_id) {
          try {
            const { addTracking } = await import("../email/tracking/linkRewriter.js");
            const backendBaseUrl = isDevelopment
              ? "http://localhost:3001"
              : `${process.env.FRONTEND_URL || "https://pullup.se"}/api`;
            const campaignTag = `vip_invite_${event.slug}`;

            const trackedHtml = addTracking(htmlBody, {
              trackingId: outboxRow.tracking_id,
              baseUrl: backendBaseUrl,
              campaignTag,
            });

            const { supabase: sb } = await import("../supabase.js");
            await sb
              .from("email_outbox")
              .update({ html_body: trackedHtml, campaign_tag: campaignTag })
              .eq("id", outboxRow.id);
          } catch (trackErr) {
            console.error("[VIP] Tracking injection failed:", trackErr.message);
          }
        }
      } catch (emailError) {
        console.error("Error sending VIP invite email:", emailError);
        // Don't fail the API if email sending fails
      }

      return res.status(201).json({
        link,
        token,
        invite: {
          id: invite.id,
          email: normalizedEmail,
          maxGuests: maxGuestsInt,
          freeEntry: effectiveFreeEntry,
          discountPercent:
            typeof discountPercent === "number" ? discountPercent : null,
        },
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("Error creating VIP invite:", error);
      res.status(500).json({
        error: "Failed to create VIP invite",
        message: error.message,
      });
    }
  }
);

// ---------------------------
// PROTECTED: List VIP invites for event (requires auth, verifies ownership)
// ---------------------------
app.get(
  "/host/events/:eventId/vip-invites",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId } = req.params;

      const event = await findEventById(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const invites = await getVipInvitesForEvent(event.id);
      const frontendUrl = getFrontendUrl();

      // Fetch per-invite email tracking stats
      const { supabase: sb } = await import("../supabase.js");
      const campaignTag = `vip_invite_${event.slug}`;

      // Get all outbox rows for this VIP campaign to map email→tracking stats
      const { data: outboxRows } = await sb
        .from("email_outbox")
        .select("id, tracking_id, to_email, status")
        .eq("campaign_tag", campaignTag);

      let opensMap = {};
      let clicksMap = {};
      if (outboxRows && outboxRows.length > 0) {
        const trackingIds = outboxRows.map((r) => r.tracking_id).filter(Boolean);

        const [opensResult, clicksResult] = await Promise.all([
          trackingIds.length > 0
            ? sb.from("email_opens").select("tracking_id").in("tracking_id", trackingIds)
            : { data: [] },
          trackingIds.length > 0
            ? sb.from("email_clicks").select("tracking_id, link_label").in("tracking_id", trackingIds)
            : { data: [] },
        ]);

        // Build email → stats mapping
        const trackingToEmail = {};
        for (const row of outboxRows) {
          if (row.tracking_id) trackingToEmail[row.tracking_id] = row.to_email?.toLowerCase();
        }

        for (const o of (opensResult.data || [])) {
          const email = trackingToEmail[o.tracking_id];
          if (email) opensMap[email] = true;
        }
        for (const c of (clicksResult.data || [])) {
          const email = trackingToEmail[c.tracking_id];
          if (email) {
            if (!clicksMap[email]) clicksMap[email] = { total: 0, cta: false };
            clicksMap[email].total++;
            if (c.link_label === "cta") clicksMap[email].cta = true;
          }
        }
      }

      // Aggregate stats
      const totalSent = outboxRows?.length || 0;
      const totalOpened = Object.keys(opensMap).length;
      const totalClicked = Object.keys(clicksMap).length;

      const mappedInvites = (invites || []).map((inv) => {
        const email = inv.email?.toLowerCase();
        return {
          id: inv.id,
          email: inv.email,
          maxGuests: inv.max_guests,
          freeEntry: inv.free_entry,
          createdAt: inv.created_at,
          expiresAt: inv.expires_at,
          link:
            inv.token && event.slug
              ? `${frontendUrl}/e/${event.slug}?vip=${inv.token}`
              : null,
          opened: !!opensMap[email],
          clicked: !!clicksMap[email],
        };
      });

      return res.json({
        invites: mappedInvites,
        stats: {
          totalSent,
          totalOpened,
          totalClicked,
          openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 1000) / 10 : 0,
          clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 1000) / 10 : 0,
        },
      });
    } catch (error) {
      console.error("Error listing VIP invites:", error);
      return res.status(500).json({
        error: "Failed to list VIP invites",
        message: error.message,
      });
    }
  }
);

// ---------------------------
// PROTECTED: Delete VIP invite (requires auth, verifies ownership)
// ---------------------------
app.delete(
  "/host/events/:eventId/vip-invites/:inviteId",
  requireAuth,
  async (req, res) => {
    try {
      const { eventId, inviteId } = req.params;

      const event = await findEventById(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { supabase } = await import("../supabase.js");
      const { error } = await supabase
        .from("vip_invites")
        .delete()
        .eq("id", inviteId)
        .eq("event_id", event.id);

      if (error) {
        if (error.code === "PGRST205") {
          return res.status(404).json({ error: "Invite not found" });
        }
        console.error("Error deleting VIP invite:", error);
        return res.status(500).json({ error: "Failed to delete invite" });
      }

      return res.status(204).send();
    } catch (error) {
      console.error("Error deleting VIP invite:", error);
      return res.status(500).json({
        error: "Failed to delete invite",
        message: error.message,
      });
    }
  }
);

// ---------------------------
// PROTECTED: Update event (requires auth, verifies ownership)
// ---------------------------
app.put(
  "/host/events/:id",
  requireAuth,
  validateEventData,
  async (req, res) => {
    const { id } = req.params;

    // Only the fields this route's own logic touches (date validation, the
    // paid-tickets-paused guard, Stripe price handling, section logo processing,
    // lifecycle status). EVERY other event field is forwarded verbatim via
    // pickEventFields below, so a new field is never dropped or maintained here.
    const {
      startsAt,
      endsAt,
      hideDate,
      ticketType,
      ticketPrice,
      ticketCurrency,
      stripeProductId,
      stripePriceId,
      sections,
      status,
    } = req.body;

    // Get current event to check if price/currency changed
    const currentEvent = await findEventById(id);
    if (!currentEvent) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Validate dates are not in the past. For TBA events the date is a private
    // placeholder, so skip the check — fall back to currentEvent.hideDate when
    // the request didn't include hideDate (partial update).
    const effectiveHideDate = hideDate !== undefined ? hideDate : currentEvent.hideDate;
    if (!effectiveHideDate && startsAt && new Date(startsAt) < new Date()) {
      return res.status(400).json({ error: "Event start date cannot be in the past" });
    }
    if (!effectiveHideDate && endsAt && new Date(endsAt) < new Date()) {
      return res.status(400).json({ error: "Event end date cannot be in the past" });
    }

    // Only owner or admin can edit event details (Stripe, pricing, etc.)
    const allowed = await canEditEvent(req.user.id, id);
    if (!allowed) {
      return res.status(403).json({
        error: "Forbidden",
        message:
          "Only the event owner or admin can edit event details.",
      });
    }

    // Check if ticket price or currency changed (for Stripe Price update)
    const priceChanged =
      ticketType === "paid" &&
      ticketPrice &&
      (currentEvent.ticketPrice !== ticketPrice ||
        (currentEvent.ticketCurrency || "usd").toLowerCase() !==
          (ticketCurrency || "usd").toLowerCase());

    // If price changed and event has Stripe product, create new Stripe Price
    // (Stripe Prices are immutable - we must create a new one)
    let newStripePriceId = stripePriceId;
    if (
      priceChanged &&
      currentEvent.stripeProductId &&
      ticketType === "paid" &&
      ticketPrice
    ) {
      try {
        const { createStripePrice } = await import("../stripe.js");
        const newPrice = await createStripePrice({
          productId: currentEvent.stripeProductId,
          amount: ticketPrice, // Already in cents
          currency: ticketCurrency || currentEvent.ticketCurrency || "usd",
          eventId: id,
        });
        newStripePriceId = newPrice.id;
        console.log(
          `[Stripe] Created new price ${newPrice.id} for event ${id} (old: ${currentEvent.stripePriceId})`
        );
      } catch (error) {
        console.error("Error creating new Stripe price:", error);
        // Continue with update even if Stripe price creation fails
        // The old price will still work, but new payments will use the new price from DB
      }
    }

    // Paid tickets are PAUSED (money-hole guard): block switching a free event TO
    // paid — never mint a Stripe product via update. Events already paid before
    // the pause (they carry a stripeProductId) are left exactly as they are; their
    // config passes through unchanged below.
    let effectiveTicketType = ticketType;
    let effectiveTicketPrice = ticketPrice;
    if (ticketType === "paid" && !currentEvent.stripeProductId) {
      logger?.warn?.("[PUT /host/events] paid tickets paused — keeping event free", { eventId: id });
      effectiveTicketType = "free";
      effectiveTicketPrice = null;
    }

    // Upload any hostedby logos from sections to storage before saving
    let processedSections = sections;
    if (sections && Array.isArray(sections)) {
      try {
        processedSections = await processHostedByLogos(id, sections);
      } catch (err) {
        console.warn(`[PUT /host/events/${id}] Hosted-by logo upload failed:`, err.message);
      }
    }

    let updated;
    try {
      updated = await updateEvent(id, {
        // All content fields forwarded through the shared allowlist…
        ...pickEventFields(req.body),
        // …then the route's computed values win (paid-pause guard, processed
        // sections with hosted-by logos, resolved stripe ids, lifecycle status).
        // ticketCurrency is left raw — mapEventToDb lowercases it.
        ticketType: effectiveTicketType,
        ticketPrice: effectiveTicketPrice,
        sections: processedSections,
        stripeProductId: stripeProductId || currentEvent.stripeProductId,
        stripePriceId: newStripePriceId || currentEvent.stripePriceId,
        status,
      });
    } catch (err) {
      console.error(`[PUT /host/events/${id}] Update failed:`, err.message);
      const status = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
      return res.status(status).json({
        error: status === 400 ? "invalid_input" : "Failed to update event",
        message: err.message,
      });
    }

    if (!updated) return res.status(404).json({ error: "Event not found" });

    // If status flipped to DRAFT, log as unpublish; otherwise as update.
    const wasUnpublish = req.body?.status === "DRAFT" && updated.status === "DRAFT";
    emitIntent({
      hostId: req.user.id,
      tool: wasUnpublish ? "unpublish_event" : "update_event",
      args: req.body,
      source: sourceFromRequest(req),
      target: { type: "event", id: updated.id },
      result: { slug: updated.slug, status: updated.status },
    });

    res.json(updated);
  }
);

// ---------------------------
// PROTECTED: Publish event (requires auth, verifies ownership)
// ---------------------------
app.put("/host/events/:id/publish", requireAuth, async (req, res) => {
  const { id } = req.params;
  const event = await findEventById(id);

  if (!event) {
    return res.status(404).json({ error: "Event not found" });
  }

  // Only owner or admin can publish/unpublish
  const allowed = await canEditEvent(req.user.id, id);
  if (!allowed) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Only the event owner or admin can publish events.",
    });
  }

  // Reach floor: a published event MUST require a way to reach its guests — at
  // least one of Email or WhatsApp(phone) at RSVP. Enforced server-side (not just
  // the wizard) so the API/MCP can't ship an event nobody can be contacted from.
  if (event.requireEmail === false && event.requirePhone !== true) {
    return res.status(400).json({
      error: "reach_floor",
      message: "Require at least one of Email or WhatsApp at RSVP before publishing — otherwise you can't reach anyone who signs up.",
    });
  }

  const updated = await updateEvent(id, { status: "PUBLISHED" });
  if (!updated) {
    return res.status(404).json({ error: "Event not found" });
  }

  emitIntent({
    hostId: req.user.id,
    tool: "publish_event",
    args: { id },
    source: sourceFromRequest(req),
    target: { type: "event", id: updated.id },
    result: { slug: updated.slug, status: updated.status },
  });

  res.json(updated);
});

// ---------------------------
// PROTECTED: Delete event (requires auth, owner only, no RSVPs)
// ---------------------------
app.delete("/host/events/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const event = await findEventById(id);

  if (!event) {
    return res.status(404).json({ error: "Event not found" });
  }

  const isOwner = await isUserEventOwner(req.user.id, id);
  if (!isOwner) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Only the event owner can delete an event.",
    });
  }

  const result = await deleteEvent(id);

  if (result.error === "has_registrations") {
    return res.status(400).json({ error: result.error, message: result.message });
  }

  if (result.error) {
    return res.status(500).json({ error: result.error, message: result.message });
  }

  emitIntent({
    hostId: req.user.id,
    tool: "delete_event",
    args: { id },
    source: sourceFromRequest(req),
    target: { type: "event", id },
    result: { slug: event.slug },
  });

  res.json({ success: true });
});

// Duplicate an event into a fresh DRAFT the current user owns. Copies
// everything *inside* the event (theme, sections, media, location + pin,
// ticket/capacity/dinner settings) but NOT the guest graph — RSVPs, the room
// timeline, and tracking live in separate tables keyed by event_id, so a clone
// starts empty. The host only has to change name + date. Mirrors the MCP
// duplicate_event so chat and the dashboard button behave identically.
app.post("/host/events/:id/duplicate", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const event = await findEventById(id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const { isHost } = await isUserEventHost(req.user.id, event.id);
    if (!isHost) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Only a host of this event can duplicate it.",
      });
    }

    // Strip identity / lifecycle so createEvent starts a clean record. Also drop
    // the computed fields findEventById tacks on (they aren't event columns).
    const {
      id: _id, slug, hostId, createdAt, updatedAt, status,
      stripeProductId, stripePriceId,
      myRole, _stats, _count, viewCount,
      ...rest
    } = event;

    // Optional overrides (the MCP passes these when the AI already knows the new
    // title/date, e.g. "Vol 3" from a series). Default: "<title> (copy)" and a
    // future placeholder the host overwrites. Duration is preserved either way.
    const titleOverride = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const newTitle = titleOverride || `${event.title || "Untitled event"} (copy)`;
    const newStartsAt = req.body?.startsAt || new Date(Date.now() + 7 * 86400000).toISOString();
    let newEndsAt = null;
    if (event.startsAt && event.endsAt) {
      const delta = new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime();
      if (delta > 0) newEndsAt = new Date(new Date(newStartsAt).getTime() + delta).toISOString();
    }

    const created = await createEvent({
      ...rest,
      hostId: req.user.id,
      title: newTitle,
      startsAt: newStartsAt,
      endsAt: newEndsAt,
      status: "DRAFT",
    });

    // Clone the host's media gallery. The rows point at shared storage paths, so
    // we copy the rows (not the files) under the new event_id. Skip the
    // `darkroom` folder — that's guests' post-event uploads, not the host's set.
    try {
      const { supabase } = await import("../supabase.js");
      const { data: mediaRows } = await supabase
        .from("event_media")
        .select("media_type, storage_path, thumbnail_path, position, is_cover, mime_type, folder")
        .eq("event_id", event.id)
        .or("folder.is.null,folder.neq.darkroom")
        .order("position", { ascending: true });
      if (mediaRows && mediaRows.length) {
        await supabase
          .from("event_media")
          .insert(mediaRows.map((m) => ({ ...m, event_id: created.id })));
      }
      // createEvent copies image_url but not cover_image_url — carry it so the
      // clone's cover is identical on every surface.
      if (event.coverImageUrl) {
        await supabase
          .from("events")
          .update({ cover_image_url: event.coverImageUrl })
          .eq("id", created.id);
      }
    } catch (mediaErr) {
      console.error("Duplicate: media gallery copy failed (event still created):", mediaErr?.message);
    }

    emitIntent({
      hostId: req.user.id,
      tool: "duplicate_event",
      args: { id },
      source: sourceFromRequest(req),
      target: { type: "event", id: created.id },
      result: { slug: created.slug, from: event.slug },
    });

    res.json({ success: true, event: created });
  } catch (error) {
    console.error("Error duplicating event:", error);
    res.status(500).json({ error: "Failed to duplicate event" });
  }
});

}
