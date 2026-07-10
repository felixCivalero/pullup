// Host CRM people routes: people list + filter index, person detail/export/update,
// host-private timeline notes CRUD, and explainable match suggestions.

import { getAllPeopleWithStats, updatePerson } from "../data.js";
import { requireAuth } from "../middleware/auth.js";
import { validate, personUpdateSchema } from "../middleware/validate.js";
import { emitIntent, sourceFromRequest } from "../services/intentLog.js";

// Users whose one-time orphaned-event backfill has already run this process —
// so the legacy migration doesn't fire a table UPDATE on EVERY CRM load.
const orphanAssignDone = new Set();

export function registerCrmPeopleRoutes(app) {
  // ---------------------------
  // PROTECTED: Get all people (CRM) - filtered by user's events
  // ---------------------------
  app.get("/host/crm/people", requireAuth, async (req, res) => {
    try {
      // Assign orphaned events to this user on first access (one-time migration).
      // Guarded to run at most once per user per process — no more UPDATE-on-read.
      if (!orphanAssignDone.has(req.user.id)) {
        orphanAssignDone.add(req.user.id);
        try {
          const { assignOrphanedEventsToUser } = await import("../migrations.js");
          await assignOrphanedEventsToUser(req.user.id);
        } catch (migrationError) {
          // Log but don't fail - migration is optional. Allow a retry next time.
          console.log("Migration note:", migrationError.message);
          orphanAssignDone.delete(req.user.id);
        }
      }

      // Check for query parameters for filtering
      const {
        search,
        email,
        name,
        totalSpendMin,
        totalSpendMax,
        paymentCountMin,
        paymentCountMax,
        subscriptionType,
        interestedIn,
        tags,
        hasStripeCustomerId,
        attendedEventId,
        attendedEventIds,
        attendedEventTags,
        hasDinner,
        attendanceStatus,
        eventsAttendedMin,
        eventsAttendedMax,
        sortBy = "created_at",
        sortOrder = "desc",
        limit = 50,
        offset = 0,
      } = req.query;

      // If filters provided, use getPeopleWithFilters
      if (
        search ||
        email ||
        name ||
        totalSpendMin ||
        totalSpendMax ||
        paymentCountMin ||
        paymentCountMax ||
        subscriptionType ||
        interestedIn ||
        tags ||
        hasStripeCustomerId !== undefined ||
        attendedEventId ||
        attendedEventIds ||
        attendedEventTags ||
        hasDinner !== undefined ||
        attendanceStatus ||
        eventsAttendedMin ||
        eventsAttendedMax
      ) {
        const { getPeopleWithFilters } = await import("../data.js");
        const filters = {
          search,
          email,
          name,
          totalSpendMin: totalSpendMin ? parseInt(totalSpendMin, 10) : undefined,
          totalSpendMax: totalSpendMax ? parseInt(totalSpendMax, 10) : undefined,
          paymentCountMin: paymentCountMin
            ? parseInt(paymentCountMin, 10)
            : undefined,
          paymentCountMax: paymentCountMax
            ? parseInt(paymentCountMax, 10)
            : undefined,
          subscriptionType,
          interestedIn,
          tags: tags ? tags.split(",") : undefined,
          hasStripeCustomerId:
            hasStripeCustomerId !== undefined
              ? hasStripeCustomerId === "true"
              : undefined,
          attendedEventId,
          attendedEventIds: attendedEventIds
            ? attendedEventIds.split(",")
            : undefined,
          attendedEventTags: attendedEventTags
            ? attendedEventTags.split(",")
            : undefined,
          hasDinner: hasDinner !== undefined ? hasDinner === "true" : undefined,
          attendanceStatus,
          eventsAttendedMin: eventsAttendedMin
            ? parseInt(eventsAttendedMin, 10)
            : undefined,
          eventsAttendedMax: eventsAttendedMax
            ? parseInt(eventsAttendedMax, 10)
            : undefined,
        };

        const result = await getPeopleWithFilters(
          req.user.id,
          filters,
          sortBy,
          sortOrder,
          parseInt(limit, 10),
          parseInt(offset, 10)
        );

        return res.json({
          people: result.people,
          total: result.total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
        });
      }

      // Otherwise use getAllPeopleWithStats (backward compatibility)
      // and apply simple in-memory pagination so the frontend only
      // renders a page of results at a time.
      const people = await getAllPeopleWithStats(req.user.id);
      const limitNum = parseInt(limit, 10) || 50;
      const offsetNum = parseInt(offset, 10) || 0;
      const pagedPeople = people.slice(offsetNum, offsetNum + limitNum);

      res.json({
        people: pagedPeople,
        total: people.length,
        limit: limitNum,
        offset: offsetNum,
      });
    } catch (error) {
      console.error("Error fetching people:", error);
      res.status(500).json({ error: "Failed to fetch people" });
    }
  });

  // GET /host/crm/people-filter-index — lightweight per-person summary that
  // lets the frontend compute filtered audience size client-side in real time
  // without paying for a full paginated /people round-trip on every click.
  // Returns just what the segment filters need: id, attended event IDs, the
  // admin_tags of those events, and a hadDinner boolean. ~50–150 bytes per
  // person, fine for hosts well into the tens of thousands.
  app.get("/host/crm/people-filter-index", requireAuth, async (req, res) => {
    try {
      const people = await getAllPeopleWithStats(req.user.id);

      // Batch-check the suppression list once for everyone in the host's
      // CRM. This lets the frontend show a live recipient count that already
      // excludes unsendable contacts (no email, unsubscribed, bounced).
      const emails = people.map((p) => p.email).filter(Boolean);
      const { getSuppressedEmailSet } = await import(
        "../email/repos/emailSuppressionsRepo.js"
      );
      const suppressed = await getSuppressedEmailSet(emails);

      const index = people.map((p) => {
        const eventIds = [];
        let hadDinner = false;
        for (const h of p.eventHistory || []) {
          if (h.eventId) eventIds.push(h.eventId);
          if (h.wantsDinner) hadDinner = true;
        }
        const sendable =
          !!p.email &&
          !p.marketingUnsubscribedAt &&
          !suppressed.has(String(p.email).toLowerCase());
        return { id: p.id, eventIds, hadDinner, sendable };
      });
      return res.json({ index, total: index.length });
    } catch (error) {
      console.error("Error building people filter index:", error);
      return res.status(500).json({ error: "Failed to build filter index" });
    }
  });

  // ---------------------------
  // PROTECTED: Get person details with touchpoints
  // ---------------------------
  // Who in your world is closest to this person, and WHY — behavioral overlap
  // (shared events) fused with third-party signals (IG reach + reciprocity).
  // Explainable: each match carries its reasons. Foundation for intros/lookalikes.
  app.get("/host/crm/people/:personId/matches", requireAuth, async (req, res) => {
    try {
      const { personId } = req.params;
      const { personBelongsToHost } = await import("../data.js");
      const allowed = await personBelongsToHost(personId, req.user.id);
      if (!allowed) return res.status(404).json({ error: "Person not found" });
      const { findMatches } = await import("../services/peopleMatching.js");
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 10, 50));
      const result = await findMatches({ hostId: req.user.id, personId, limit });
      res.json(result);
    } catch (error) {
      console.error("Error finding matches:", error);
      res.status(500).json({ error: "match_failed" });
    }
  });

  app.get("/host/crm/people/:personId", requireAuth, async (req, res) => {
    try {
      const { personId } = req.params;
      const {
        getPersonTouchpoints,
        findPersonById,
        personBelongsToHost,
        getPersonNotes,
      } = await import("../data.js");

      // Authorize before fetching so we don't reveal whether the personId exists
      // to a host who has no relationship with that person.
      const allowed = await personBelongsToHost(personId, req.user.id);
      if (!allowed) {
        return res.status(404).json({ error: "Person not found" });
      }

      const person = await findPersonById(personId);
      if (!person) {
        return res.status(404).json({ error: "Person not found" });
      }

      const touchpoints = await getPersonTouchpoints(personId, req.user.id);
      // Host-private timeline notes ride along inside touchpoints (the history
      // bucket) so the expanded CRM row and the MCP coach get them in one round
      // trip.
      touchpoints.notes = await getPersonNotes(personId, req.user.id);

      res.json({
        person,
        touchpoints,
      });
    } catch (error) {
      console.error("Error fetching person details:", error);
      res.status(500).json({ error: "Failed to fetch person details" });
    }
  });

  // ---------------------------
  // PROTECTED: Export CRM people as CSV
  // ---------------------------
  // NOTE: This export respects the same filters as GET /host/crm/people.
  // If query parameters are provided, we export ONLY the filtered segment.
  // Otherwise we export all people with stats for this host.
  app.get("/host/crm/people/export", requireAuth, async (req, res) => {
    try {
      const {
        search,
        email,
        name,
        totalSpendMin,
        totalSpendMax,
        paymentCountMin,
        paymentCountMax,
        subscriptionType,
        interestedIn,
        tags,
        hasStripeCustomerId,
        attendedEventId,
        attendedEventIds,
        attendedEventTags,
        hasDinner,
        attendanceStatus,
        eventsAttendedMin,
        eventsAttendedMax,
      } = req.query;

      let people;

      // If any filter is present, export the filtered segment
      if (
        search ||
        email ||
        name ||
        totalSpendMin ||
        totalSpendMax ||
        paymentCountMin ||
        paymentCountMax ||
        subscriptionType ||
        interestedIn ||
        tags ||
        hasStripeCustomerId !== undefined ||
        attendedEventId ||
        attendedEventIds ||
        attendedEventTags ||
        hasDinner !== undefined ||
        attendanceStatus ||
        eventsAttendedMin ||
        eventsAttendedMax
      ) {
        const { getPeopleWithFilters } = await import("../data.js");
        const filters = {
          search,
          email,
          name,
          totalSpendMin: totalSpendMin ? parseInt(totalSpendMin, 10) : undefined,
          totalSpendMax: totalSpendMax ? parseInt(totalSpendMax, 10) : undefined,
          paymentCountMin: paymentCountMin
            ? parseInt(paymentCountMin, 10)
            : undefined,
          paymentCountMax: paymentCountMax
            ? parseInt(paymentCountMax, 10)
            : undefined,
          subscriptionType,
          interestedIn,
          tags: tags ? tags.split(",") : undefined,
          hasStripeCustomerId:
            hasStripeCustomerId !== undefined
              ? hasStripeCustomerId === "true"
              : undefined,
          attendedEventId,
          attendedEventIds: attendedEventIds
            ? attendedEventIds.split(",")
            : undefined,
          attendedEventTags: attendedEventTags
            ? attendedEventTags.split(",")
            : undefined,
          hasDinner: hasDinner !== undefined ? hasDinner === "true" : undefined,
          attendanceStatus,
          eventsAttendedMin: eventsAttendedMin
            ? parseInt(eventsAttendedMin, 10)
            : undefined,
          eventsAttendedMax: eventsAttendedMax
            ? parseInt(eventsAttendedMax, 10)
            : undefined,
        };

        // For export we want the full segment, not paginated,
        // so request a large limit with offset 0.
        const result = await getPeopleWithFilters(
          req.user.id,
          filters,
          "created_at",
          "desc",
          10000,
          0
        );
        people = result.people || [];
      } else {
        // No filters: export all people with stats
        people = await getAllPeopleWithStats(req.user.id);
      }

      // CSV header
      const headers = [
        "Name",
        "Email",
        "Phone",
        "Tags",
        "Total Events",
        "Events Attended",
        "Events Waitlisted",
        "Total Guests Brought",
        "Total Dinners",
        "Total Dinner Guests",
        "First Seen",
      ];

      // CSV rows
      const rows = people.map((person) => {
        const escapeCsv = (value) => {
          if (value === null || value === undefined) return "";
          const str = String(value);
          // If contains comma, quote, or newline, wrap in quotes and escape quotes
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        return [
          escapeCsv(person.name),
          escapeCsv(person.email),
          escapeCsv(person.phone),
          escapeCsv(person.tags?.join(", ") || ""),
          escapeCsv(person.stats?.totalEvents || 0),
          escapeCsv(person.stats?.eventsAttended || 0),
          escapeCsv(person.stats?.eventsWaitlisted || 0),
          escapeCsv(person.stats?.totalGuestsBrought || 0),
          escapeCsv(person.stats?.totalDinners || 0),
          escapeCsv(person.stats?.totalDinnerGuests || 0),
          escapeCsv(
            person.createdAt
              ? new Date(person.createdAt).toLocaleDateString("en-US")
              : ""
          ),
        ].join(",");
      });

      const csv = [headers.join(","), ...rows].join("\n");

      // Set headers for CSV download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="crm-contacts-${
          new Date().toISOString().split("T")[0]
        }.csv"`
      );
      res.send(csv);
    } catch (error) {
      console.error("Error exporting CRM people:", error);
      res.status(500).json({ error: "Failed to export CRM data" });
    }
  });

  // ---------------------------
  // PROTECTED: Update person (requires auth)
  // ---------------------------
  app.put("/host/crm/people/:personId", requireAuth, validate(personUpdateSchema), async (req, res) => {
    try {
      const { personId } = req.params;
      const {
        name,
        phone,
        tags,
        // Identity fields collected via event form_fields. Editable here so
        // hosts can fill in details they already know (e.g. an Instagram
        // handle they grabbed in person).
        instagram,
        twitter,
        tiktok,
        linkedin,
        company,
        birthday,
      } = req.body;

      const { personBelongsToHost } = await import("../data.js");
      const allowed = await personBelongsToHost(personId, req.user.id);
      if (!allowed) {
        return res.status(404).json({ error: "Person not found" });
      }

      const result = await updatePerson(personId, {
        name,
        phone,
        tags,
        instagram,
        twitter,
        tiktok,
        linkedin,
        company,
        birthday,
      });

      if (result.error === "not_found") {
        return res.status(404).json({ error: "Person not found" });
      }

      // Host typed this in → record it as the top-precedence "manual" source so it
      // wins over any platform profile and survives future re-resolution.
      if (result.person && (name || instagram)) {
        try {
          const { upsertSourceProfile } = await import("../services/personSourceProfiles.js");
          await upsertSourceProfile({
            personId,
            source: "manual",
            handle: instagram || null,
            displayName: (name || "").trim() || null,
            data: { name, instagram, twitter, tiktok, linkedin, company, birthday, edited_by: req.user.id },
          });
        } catch (e) {
          console.error("[update_person] manual source capture failed:", e?.message);
        }
      }

      emitIntent({
        hostId: req.user.id,
        tool: "update_person",
        args: { personId: req.params.personId, ...req.body },
        source: sourceFromRequest(req),
        target: { type: "person", id: req.params.personId },
        result: { name: result.person?.name },
      });

      res.json(result.person);
    } catch (error) {
      console.error("Error updating person:", error);
      res.status(500).json({ error: "Failed to update person" });
    }
  });

  // ---------------------------
  // PROTECTED: Person timeline notes (requires auth)
  // ---------------------------
  // A running log of dated observations about a person ("talked Leica on the
  // photowalk"). PRIVATE per host — people are shared across hosts, so every
  // handler re-asserts personBelongsToHost + host_id ownership. `topic` is set
  // only by the AI via MCP and never surfaced in the web UI.

  app.get(
    "/host/crm/people/:personId/notes",
    requireAuth,
    async (req, res) => {
      try {
        const { personId } = req.params;
        const { personBelongsToHost, getPersonNotes } = await import("../data.js");
        const allowed = await personBelongsToHost(personId, req.user.id);
        if (!allowed) {
          return res.status(404).json({ error: "Person not found" });
        }
        const notes = await getPersonNotes(personId, req.user.id);
        res.json({ notes });
      } catch (error) {
        console.error("Error fetching person notes:", error);
        res.status(500).json({ error: "Failed to fetch notes" });
      }
    },
  );

  app.post(
    "/host/crm/people/:personId/notes",
    requireAuth,
    async (req, res) => {
      try {
        const { personId } = req.params;
        const { content, eventId, noteDate, topic } = req.body || {};
        const { personBelongsToHost, createPersonNote } = await import(
          "../data.js"
        );
        const allowed = await personBelongsToHost(personId, req.user.id);
        if (!allowed) {
          return res.status(404).json({ error: "Person not found" });
        }

        const result = await createPersonNote(personId, req.user.id, {
          content,
          eventId,
          noteDate,
          topic,
          source: sourceFromRequest(req) === "chat" ? "mcp" : "ui",
        });
        if (result.error === "empty_content") {
          return res.status(400).json({ error: "Note content is required" });
        }
        if (result.error) {
          return res.status(500).json({ error: "Failed to create note" });
        }

        emitIntent({
          hostId: req.user.id,
          tool: "add_person_note",
          args: { personId, content, eventId, noteDate, topic },
          source: sourceFromRequest(req),
          target: { type: "person", id: personId },
          result: { noteId: result.note.id },
        });

        res.status(201).json(result.note);
      } catch (error) {
        console.error("Error creating person note:", error);
        res.status(500).json({ error: "Failed to create note" });
      }
    },
  );

  app.patch(
    "/host/crm/people/:personId/notes/:noteId",
    requireAuth,
    async (req, res) => {
      try {
        const { personId, noteId } = req.params;
        const { content, eventId, noteDate, topic } = req.body || {};
        const { personBelongsToHost, updatePersonNote } = await import(
          "../data.js"
        );
        const allowed = await personBelongsToHost(personId, req.user.id);
        if (!allowed) {
          return res.status(404).json({ error: "Person not found" });
        }

        const result = await updatePersonNote(noteId, personId, req.user.id, {
          content,
          eventId,
          noteDate,
          topic,
        });
        if (result.error === "empty_content") {
          return res.status(400).json({ error: "Note content is required" });
        }
        if (result.error === "not_found") {
          return res.status(404).json({ error: "Note not found" });
        }
        res.json(result.note);
      } catch (error) {
        console.error("Error updating person note:", error);
        res.status(500).json({ error: "Failed to update note" });
      }
    },
  );

  app.delete(
    "/host/crm/people/:personId/notes/:noteId",
    requireAuth,
    async (req, res) => {
      try {
        const { personId, noteId } = req.params;
        const { personBelongsToHost, deletePersonNote } = await import(
          "../data.js"
        );
        const allowed = await personBelongsToHost(personId, req.user.id);
        if (!allowed) {
          return res.status(404).json({ error: "Person not found" });
        }
        const result = await deletePersonNote(noteId, personId, req.user.id);
        if (result.error === "not_found") {
          return res.status(404).json({ error: "Note not found" });
        }
        res.json({ ok: true });
      } catch (error) {
        console.error("Error deleting person note:", error);
        res.status(500).json({ error: "Failed to delete note" });
      }
    },
  );
}
