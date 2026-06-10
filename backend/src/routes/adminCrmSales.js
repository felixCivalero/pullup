// Admin host CRM + sales leads: the /admin/crm per-host customer-understanding
// view and the /admin/sales/leads CRUD pipeline (extracted verbatim from index.js).

import { requireAdmin } from "../middleware/auth.js";

export function registerAdminCrmSalesRoutes(app) {
  // GET /admin/crm/hosts — customer-understanding view.
  //
  // One row per profile (every signed-up user) enriched with everything we
  // know about how they use PullUp: events created, capacity patterns,
  // confirmed-guest totals, hosting frequency, the admin-set tag distribution
  // across their events, plus their sales pipeline state if any.
  //
  // Designed for the new /admin/crm page that replaces the per-lead /admin/sales
  // lens with a per-host one. Keeps the existing sales_leads table as the
  // source of truth for pipeline status / notes / source / internal sales
  // contact info; all of that surfaces here as `sales: { ... }`.
  app.get("/admin/crm/hosts", requireAdmin, async (req, res) => {
    try {
      const { supabase: sb } = await import("../supabase.js");

      const [profilesRes, eventsRes, leadsRes] = await Promise.all([
        sb
          .from("profiles")
          .select(
            "id, name, brand, contact_email, mobile_number, city, visitor_id, created_at, last_login_at, login_count",
          ),
        sb
          .from("events")
          .select(
            "id, host_id, title, slug, starts_at, total_capacity, cocktail_capacity, admin_tags, dinner_enabled, food_capacity, ticket_type, ticket_price, ticket_currency, require_approval",
          ),
        sb
          .from("sales_leads")
          .select(
            "id, profile_id, name, email, status, source, notes, city, phone, company, priority, created_at",
          ),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (leadsRes.error) throw leadsRes.error;

      const profiles = profilesRes.data || [];
      const events = eventsRes.data || [];
      const leads = leadsRes.data || [];

      // RSVP, VIP, and team-host counts per event.
      const eventIds = events.map((e) => e.id);
      const rsvpsByEvent = {};
      const vipCountByEvent = {};
      const hostCountByEvent = {};
      if (eventIds.length) {
        const [rsvpsRes, vipRes, ehRes] = await Promise.all([
          sb
            .from("rsvps")
            .select("event_id, party_size, total_guests, booking_status, status")
            .in("event_id", eventIds),
          sb.from("vip_invites").select("event_id").in("event_id", eventIds),
          sb.from("event_hosts").select("event_id").in("event_id", eventIds),
        ]);
        for (const r of rsvpsRes.data || []) {
          if (
            r.booking_status === "CONFIRMED" ||
            r.booking_status === "PENDING_PAYMENT" ||
            r.status === "attending"
          ) {
            rsvpsByEvent[r.event_id] =
              (rsvpsByEvent[r.event_id] || 0) +
              (r.total_guests ?? r.party_size ?? 1);
          }
        }
        for (const v of vipRes.data || []) {
          vipCountByEvent[v.event_id] = (vipCountByEvent[v.event_id] || 0) + 1;
        }
        for (const h of ehRes.data || []) {
          hostCountByEvent[h.event_id] = (hostCountByEvent[h.event_id] || 0) + 1;
        }
      }

      // Email backfill from auth.users for profiles that haven't set
      // contact_email explicitly (most users today).
      const authEmails = {};
      try {
        const { data: au } = await sb.auth.admin.listUsers({ perPage: 1000 });
        for (const u of au?.users || []) {
          if (u.email) authEmails[u.id] = u.email;
        }
      } catch {
        // listUsers can fail in some environments; fall through gracefully.
      }

      // Pre-signup engagement signal: how many times did this person hit
      // the landing page before they signed up? Keyed by visitor_id which
      // we capture on the profile during onboarding finalize. We aggregate
      // total visits + first/last visit dates per known visitor_id.
      const visitorIds = profiles
        .map((p) => p.visitor_id)
        .filter(Boolean);
      const landingByVisitor = {};
      if (visitorIds.length) {
        try {
          const { data: views } = await sb
            .from("landing_page_views")
            .select("visitor_id, created_at")
            .in("visitor_id", visitorIds);
          for (const v of views || []) {
            if (!v.visitor_id) continue;
            const slot =
              landingByVisitor[v.visitor_id] ||
              (landingByVisitor[v.visitor_id] = {
                count: 0,
                first: v.created_at,
                last: v.created_at,
              });
            slot.count += 1;
            if (!slot.first || v.created_at < slot.first) slot.first = v.created_at;
            if (!slot.last || v.created_at > slot.last) slot.last = v.created_at;
          }
        } catch {
          // Optional enrichment — safe to fall through.
        }
      }

      const eventsByHost = {};
      for (const e of events) {
        if (!e.host_id) continue;
        if (!eventsByHost[e.host_id]) eventsByHost[e.host_id] = [];
        eventsByHost[e.host_id].push(e);
      }

      const leadByProfile = {};
      for (const l of leads) {
        if (l.profile_id) leadByProfile[l.profile_id] = l;
      }

      const now = Date.now();
      const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30;

      const hosts = profiles.map((p) => {
        const evList = eventsByHost[p.id] || [];
        const total = evList.length;
        const upcoming = evList.filter(
          (e) => new Date(e.starts_at).getTime() >= now,
        ).length;
        const past = total - upcoming;

        const dates = evList
          .map((e) => new Date(e.starts_at).getTime())
          .filter((t) => Number.isFinite(t));
        const firstEventAt = dates.length
          ? new Date(Math.min(...dates)).toISOString()
          : null;
        const lastEventAt = dates.length
          ? new Date(Math.max(...dates)).toISOString()
          : null;

        const capacities = evList
          .map((e) => Number(e.total_capacity || e.cocktail_capacity || 0))
          .filter((c) => c > 0);
        const totalCapacity = capacities.reduce((a, b) => a + b, 0);
        const avgCapacity = capacities.length
          ? Math.round(totalCapacity / capacities.length)
          : 0;

        const totalConfirmedGuests = evList.reduce(
          (sum, e) => sum + (rsvpsByEvent[e.id] || 0),
          0,
        );

        // Frequency: events per month over their active span. Floor at 1 month
        // so a host with one event today doesn't read as "30 events/month".
        let monthsActive = 1;
        if (firstEventAt) {
          const span = (now - new Date(firstEventAt).getTime()) / MS_PER_MONTH;
          monthsActive = Math.max(1, Math.round(span));
        }
        const frequencyPerMonth =
          total > 0 ? Math.round((total / monthsActive) * 10) / 10 : 0;

        // Tag distribution across all their events. Top 10 only — the long
        // tail isn't useful in a row view.
        const tagCounts = {};
        for (const e of evList) {
          for (const t of e.admin_tags || []) {
            tagCounts[t] = (tagCounts[t] || 0) + 1;
          }
        }
        const topTags = Object.entries(tagCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([tag, count]) => ({ tag, count }));

        const lead = leadByProfile[p.id];

        // Activity tier — useful filter chip on the frontend.
        let activity = "lurker";
        if (total >= 5) activity = "repeat";
        else if (total >= 1) activity = "active";

        const landing = p.visitor_id ? landingByVisitor[p.visitor_id] : null;

        return {
          id: p.id,
          name: p.name || null,
          brand: p.brand || null,
          email: p.contact_email || authEmails[p.id] || null,
          phone: p.mobile_number || null,
          city: p.city || null,
          createdAt: p.created_at,
          lastLoginAt: p.last_login_at || null,
          loginCount: p.login_count || 0,
          activity,
          landing: landing
            ? {
                visits: landing.count,
                firstVisitAt: landing.first,
                lastVisitAt: landing.last,
              }
            : null,
          sales: lead
            ? {
                leadId: lead.id,
                status: lead.status,
                source: lead.source,
                notes: lead.notes,
                priority: lead.priority || "normal",
                internalCity: lead.city,
                internalPhone: lead.phone,
                internalCompany: lead.company,
              }
            : null,
          events: {
            total,
            upcoming,
            past,
            firstEventAt,
            lastEventAt,
            totalCapacity,
            avgCapacity,
            totalConfirmedGuests,
            frequencyPerMonth,
            // Compact list for the expanded panel — full details available via
            // /admin/platform-events when needed. Surfaces lightweight
            // feature signals (dinner / VIP / team / ticket / approval) so
            // admin can read each event's shape at a glance.
            list: evList
              .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
              .map((e) => ({
                id: e.id,
                slug: e.slug,
                title: e.title,
                startsAt: e.starts_at,
                capacity: e.total_capacity || e.cocktail_capacity || 0,
                confirmedGuests: rsvpsByEvent[e.id] || 0,
                adminTags: Array.isArray(e.admin_tags) ? e.admin_tags : [],
                dinnerEnabled: !!e.dinner_enabled,
                dinnerSeats: Number(e.food_capacity || 0),
                vipCount: vipCountByEvent[e.id] || 0,
                teamCount: hostCountByEvent[e.id] || 0,
                ticketType: e.ticket_type || "free",
                ticketPrice: e.ticket_price || 0,
                ticketCurrency: e.ticket_currency || null,
                requireApproval: !!e.require_approval,
              })),
          },
          topTags,
        };
      });

      // Surface unlinked sales_leads (manual prospects who haven't signed up
      // yet) as synthetic rows so the CRM is a single pane for the entire
      // pipeline. They get id "lead:<uuid>" and isLead=true so the frontend
      // knows to expose the full identity-edit form for them. When they
      // eventually sign up, createDefaultProfile() back-links them by email
      // and they merge into a profile row automatically.
      for (const l of leads) {
        if (l.profile_id) continue; // already attached to a profile row above
        hosts.push({
          id: `lead:${l.id}`,
          isLead: true,
          name: l.name || null,
          brand: l.company || null,
          email: l.email || null,
          phone: l.phone || null,
          city: l.city || null,
          createdAt: l.created_at || null,
          lastLoginAt: null,
          loginCount: 0,
          activity: "lurker",
          landing: null,
          sales: {
            leadId: l.id,
            status: l.status,
            source: l.source,
            notes: l.notes,
            priority: l.priority || "normal",
            internalCity: l.city,
            internalPhone: l.phone,
            internalCompany: l.company,
          },
          events: {
            total: 0,
            upcoming: 0,
            past: 0,
            firstEventAt: null,
            lastEventAt: null,
            totalCapacity: 0,
            avgCapacity: 0,
            totalConfirmedGuests: 0,
            frequencyPerMonth: 0,
            list: [],
          },
          topTags: [],
        });
      }

      // Default sort: last event desc, then last login, then created desc.
      hosts.sort((a, b) => {
        const ta = new Date(
          a.events.lastEventAt || a.lastLoginAt || a.createdAt || 0,
        ).getTime();
        const tb = new Date(
          b.events.lastEventAt || b.lastLoginAt || b.createdAt || 0,
        ).getTime();
        return tb - ta;
      });

      return res.json({ hosts });
    } catch (err) {
      console.error("[admin/crm/hosts] error:", err.message);
      return res.status(500).json({ error: "Failed to fetch CRM hosts" });
    }
  });

  // GET /admin/sales/leads — list all leads with linked profile + event counts
  app.get("/admin/sales/leads", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { status } = req.query;

      let query = supabase
        .from("sales_leads")
        .select("*")
        .order("updated_at", { ascending: false });

      if (status && status !== "all") query = query.eq("status", status);

      const { data: leads, error } = await query;
      if (error) throw error;

      // Gather profile_ids and emails for matching
      const profileIds = leads.filter((l) => l.profile_id).map((l) => l.profile_id);
      const unlinkedLeads = leads.filter((l) => l.email && !l.profile_id);
      const emails = [...new Set(unlinkedLeads.map((l) => l.email.toLowerCase()))];

      // Fetch linked profiles (includes login tracking)
      let profileMap = {};
      if (profileIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, name, brand, created_at, last_login_at, login_count")
          .in("id", profileIds);
        if (profiles) profiles.forEach((p) => (profileMap[p.id] = p));
      }

      // Auto-match unlinked leads by email via auth.users
      let emailToUserId = {};
      if (emails.length) {
        // Fetch all auth users in one call and match by email
        const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        const allUsers = authData?.users || [];
        const usersByEmail = {};
        allUsers.forEach((u) => {
          if (u.email) usersByEmail[u.email.toLowerCase()] = u;
        });

        for (const email of emails) {
          const user = usersByEmail[email];
          if (user) {
            emailToUserId[email] = user.id;
            // Auto-link all leads with this email (case-insensitive)
            const leadIds = unlinkedLeads
              .filter((l) => l.email.toLowerCase() === email)
              .map((l) => l.id);
            if (leadIds.length) {
              await supabase
                .from("sales_leads")
                .update({ profile_id: user.id, updated_at: new Date().toISOString() })
                .in("id", leadIds);
            }
            // Fetch profile
            const { data: prof } = await supabase
              .from("profiles")
              .select("id, name, brand, created_at, last_login_at, login_count")
              .eq("id", user.id)
              .single();
            if (prof) profileMap[prof.id] = prof;
          }
        }
      }

      // Count events per profile
      const allProfileIds = [...new Set([...profileIds, ...Object.values(emailToUserId)])];
      let eventCounts = {};
      if (allProfileIds.length) {
        const { data: events } = await supabase
          .from("events")
          .select("host_id")
          .in("host_id", allProfileIds);
        if (events) {
          events.forEach((e) => {
            eventCounts[e.host_id] = (eventCounts[e.host_id] || 0) + 1;
          });
        }
      }

      // Fetch admin names for created_by / updated_by attribution
      const adminIds = [...new Set(
        leads.flatMap((l) => [l.created_by, l.updated_by]).filter(Boolean)
      )];
      let adminMap = {};
      if (adminIds.length) {
        const { data: adminProfiles } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", adminIds);
        if (adminProfiles) adminProfiles.forEach((p) => (adminMap[p.id] = p.name));
      }

      // Enrich leads
      const enriched = leads.map((lead) => {
        const pid = lead.profile_id || emailToUserId[lead.email?.toLowerCase()];
        return {
          ...lead,
          profile_id: pid || null,
          profile: pid ? profileMap[pid] || null : null,
          event_count: pid ? eventCounts[pid] || 0 : 0,
          last_sign_in_at: pid ? profileMap[pid]?.last_login_at || null : null,
          sign_in_count: pid ? profileMap[pid]?.login_count || 0 : 0,
          created_by_name: adminMap[lead.created_by] || null,
          updated_by_name: adminMap[lead.updated_by] || null,
        };
      });

      // Also surface signed-up users who don't have a sales_leads row yet,
      // so admins can see real product users (events created, last login, etc.)
      // without first manually adding them as a lead.
      // Only when the status filter is "all" or "user" — other filters target real lead statuses.
      const wantsUsers = !status || status === "all" || status === "user";
      if (wantsUsers) {
        const linkedProfileIds = new Set(
          enriched.map((l) => l.profile_id).filter(Boolean)
        );

        // Fetch every profile + their event counts (independent of which leads exist).
        const { data: allProfiles } = await supabase
          .from("profiles")
          .select("id, name, brand, contact_email, mobile_number, created_at, last_login_at, login_count");

        const orphanProfiles = (allProfiles || []).filter(
          (p) => !linkedProfileIds.has(p.id)
        );

        if (orphanProfiles.length) {
          // Event counts for orphans
          const orphanIds = orphanProfiles.map((p) => p.id);
          const { data: orphanEvents } = await supabase
            .from("events")
            .select("host_id")
            .in("host_id", orphanIds);
          const orphanEventCounts = {};
          (orphanEvents || []).forEach((e) => {
            orphanEventCounts[e.host_id] = (orphanEventCounts[e.host_id] || 0) + 1;
          });

          // Backfill emails from auth.users where profiles.contact_email is empty.
          const missingEmailIds = orphanProfiles
            .filter((p) => !p.contact_email)
            .map((p) => p.id);
          const authEmailById = {};
          if (missingEmailIds.length) {
            const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
            (authData?.users || []).forEach((u) => {
              if (u.email) authEmailById[u.id] = u.email;
            });
          }

          for (const p of orphanProfiles) {
            const email = p.contact_email || authEmailById[p.id] || null;
            enriched.push({
              id: `user:${p.id}`,
              is_user_only: true,
              name: p.name || p.brand || (email ? email.split("@")[0] : "Unknown"),
              company: p.brand || null,
              email,
              phone: p.mobile_number || null,
              status: "user",
              notes: null,
              city: null,
              source: null,
              profile_id: p.id,
              profile: {
                id: p.id,
                name: p.name,
                brand: p.brand,
                created_at: p.created_at,
                last_login_at: p.last_login_at,
                login_count: p.login_count,
              },
              event_count: orphanEventCounts[p.id] || 0,
              last_sign_in_at: p.last_login_at || null,
              sign_in_count: p.login_count || 0,
              created_at: p.created_at,
              updated_at: p.created_at,
              created_by: null,
              updated_by: null,
              created_by_name: null,
              updated_by_name: null,
            });
          }
        }

        // When the user explicitly filters to "user", drop the real leads.
        if (status === "user") {
          return res.json(enriched.filter((l) => l.is_user_only));
        }

        // Sort: most-recent activity first. Users use created_at, leads use updated_at.
        enriched.sort((a, b) => {
          const ad = new Date(a.updated_at || a.created_at || 0).getTime();
          const bd = new Date(b.updated_at || b.created_at || 0).getTime();
          return bd - ad;
        });
      }

      return res.json(enriched);
    } catch (err) {
      console.error("[sales] list error:", err.message);
      return res.status(500).json({ error: "Failed to fetch sales leads" });
    }
  });

  // POST /admin/sales/leads — create a new lead
  app.post("/admin/sales/leads", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { name, company, email, phone, status, notes, city, source, priority } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });

      const { data, error } = await supabase
        .from("sales_leads")
        .insert({
          name,
          company: company || null,
          email: email ? email.toLowerCase().trim() : null,
          phone: phone || null,
          status: status || "new",
          notes: notes || null,
          city: city || null,
          source: source || null,
          priority: priority || "normal",
          created_by: req.user.id,
          updated_by: req.user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    } catch (err) {
      console.error("[sales] create error:", err.message);
      return res.status(500).json({ error: "Failed to create lead" });
    }
  });

  // PATCH /admin/sales/leads/:id — update a lead.
  //
  // Accepts two ID forms:
  //   - real UUIDs       → updates the existing sales_leads row.
  //   - "user:<uuid>"    → synthetic ID for an auto-surfaced profile row that
  //                        doesn't have a sales_leads record yet. Lazily creates
  //                        the row tied to the profile_id and applies the
  //                        admin-internal updates. This is how "edit any user"
  //                        works without forcing admins to manually add leads
  //                        for every signup.
  //
  // For user-linked rows (profile_id present) we restrict updates to truly
  // internal fields (status/source/notes/phone/city/company) — never name or
  // email, since those belong to the user's profile and admin overrides would
  // silently diverge from what the user sees in /settings.
  app.patch("/admin/sales/leads/:id", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { id } = req.params;

      // Fields admin may set on a fully-unlinked lead row.
      const ALL_FIELDS = [
        "name",
        "company",
        "email",
        "phone",
        "status",
        "notes",
        "city",
        "source",
        "priority",
      ];
      // For profile-linked rows we LOCK the fields the user controls
      // themselves: name (profile.name), email (auth + profile.contact_email),
      // and brand (profile.brand — admin sees this as "company" on the lead).
      // The user-set values in /settings are the source of truth; admin must
      // never silently override them.
      //
      // Phone and city ARE admin-editable on linked rows (the user can't
      // change those in /settings) — but to keep the CRM display honest we
      // mirror those edits to the user's profile so /admin/crm and the user's
      // own data stay in sync. Status / source / notes / priority are pure
      // sales-internal and never touch the profile.
      const USER_OWNED = ["name", "email", "company"];
      const ADMIN_LINKED_ALLOWED = ALL_FIELDS.filter(
        (f) => !USER_OWNED.includes(f),
      );
      const MIRROR_TO_PROFILE = ["phone", "city"]; // not user-owned but lives on profile too

      async function mirrorToProfile(profileId, body) {
        const profileUpdates = {};
        if (body.phone !== undefined)
          profileUpdates.mobile_number = body.phone || null;
        if (body.city !== undefined) profileUpdates.city = body.city || null;
        if (Object.keys(profileUpdates).length === 0) return;
        try {
          await supabase
            .from("profiles")
            .update(profileUpdates)
            .eq("id", profileId);
        } catch (err) {
          console.warn("[sales] profile mirror failed:", err.message);
        }
      }

      const userOnlyMatch = /^user:([0-9a-f-]{36})$/i.exec(id);
      if (userOnlyMatch) {
        const profileId = userOnlyMatch[1];
        const updates = {};
        for (const key of ADMIN_LINKED_ALLOWED) {
          if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, name, brand, contact_email")
          .eq("id", profileId)
          .single();

        let seedEmail = profile?.contact_email || null;
        if (!seedEmail) {
          try {
            const { data: authUser } = await supabase.auth.admin.getUserById(profileId);
            seedEmail = authUser?.user?.email || null;
          } catch {}
        }

        // Mirror phone/city to the profile so the value renders consistently.
        await mirrorToProfile(profileId, req.body);

        const { data: existing } = await supabase
          .from("sales_leads")
          .select("id")
          .eq("profile_id", profileId)
          .maybeSingle();

        if (existing) {
          updates.updated_at = new Date().toISOString();
          updates.updated_by = req.user.id;
          const { data, error } = await supabase
            .from("sales_leads")
            .update(updates)
            .eq("id", existing.id)
            .select()
            .single();
          if (error) throw error;
          return res.json(data);
        }

        const { data, error } = await supabase
          .from("sales_leads")
          .insert({
            // Identity columns are seeded from the profile and never from
            // req.body — defense against client tampering on user-owned fields.
            name:
              profile?.name ||
              profile?.brand ||
              (seedEmail ? seedEmail.split("@")[0] : "User"),
            company: profile?.brand || null,
            email: seedEmail,
            status: updates.status || "new",
            source: updates.source || null,
            notes: updates.notes || null,
            phone: updates.phone || null,
            city: updates.city || null,
            priority: updates.priority || "normal",
            profile_id: profileId,
            created_by: req.user.id,
            updated_by: req.user.id,
          })
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json(data);
      }

      // Real lead row path. Determine whether it's profile-linked and apply
      // the matching allowlist + profile mirror.
      const { data: existing } = await supabase
        .from("sales_leads")
        .select("profile_id")
        .eq("id", id)
        .single();
      const isUserLinked = !!existing?.profile_id;
      const allowed = isUserLinked ? ADMIN_LINKED_ALLOWED : ALL_FIELDS;

      const updates = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      if (updates.email) updates.email = updates.email.toLowerCase().trim();
      updates.updated_at = new Date().toISOString();
      updates.updated_by = req.user.id;

      if (isUserLinked) {
        await mirrorToProfile(existing.profile_id, req.body);
      }

      const { data, error } = await supabase
        .from("sales_leads")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return res.json(data);
    } catch (err) {
      console.error("[sales] patch error:", err.message);
      return res.status(500).json({ error: "Failed to update lead" });
    }
  });

  // DELETE /admin/sales/leads/:id — remove a lead.
  // Synthetic "user:<uuid>" IDs are auto-surfaced rows with no underlying
  // sales_leads record — there's nothing to delete, so reject explicitly so
  // the UI doesn't pretend it succeeded.
  app.delete("/admin/sales/leads/:id", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { id } = req.params;
      if (/^user:/i.test(id)) {
        return res.status(400).json({ error: "Cannot delete an auto-surfaced user row." });
      }
      const { error } = await supabase.from("sales_leads").delete().eq("id", id);
      if (error) throw error;
      return res.json({ success: true });
    } catch (err) {
      console.error("[sales] delete error:", err.message);
      return res.status(500).json({ error: "Failed to delete lead" });
    }
  });
}
