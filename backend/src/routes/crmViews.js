// Routes: CRM CSV import + saved CRM views (list/create/update/delete).
// Extracted verbatim from src/index.js — zero behavior change.

import { requireAuth } from "../middleware/auth.js";
import { isUserEventHost } from "../data.js";

export function registerCrmViewRoutes(app) {
  // ---------------------------
  // PROTECTED: Import CSV (requires auth)
  // ---------------------------
  app.post("/host/crm/import-csv", requireAuth, async (req, res) => {
    try {
      // Accept JSON body with csv and optional eventId
      let csvText;
      let eventId = null;

      // Support both old format (CSV as text) and new format (JSON with csv and eventId)
      if (typeof req.body === "string") {
        csvText = req.body;
      } else if (req.body && typeof req.body.csv === "string") {
        csvText = req.body.csv;
        eventId = req.body.eventId || null;
      } else {
        return res.status(400).json({
          error: "invalid_request",
          message:
            "CSV text is required in request body (as 'csv' field in JSON or as plain text)",
        });
      }

      if (!csvText || csvText.length === 0) {
        return res.status(400).json({
          error: "invalid_request",
          message: "CSV text cannot be empty",
        });
      }

      // Verify event ownership if eventId is provided
      let event = null;
      if (eventId) {
        const { findEventById } = await import("../data.js");
        event = await findEventById(eventId);

        if (!event) {
          return res.status(404).json({
            error: "event_not_found",
            message: "Event not found",
          });
        }

        const { isHost } = await isUserEventHost(req.user.id, event.id);
        if (!isHost) {
          return res.status(403).json({
            error: "forbidden",
            message: "You don't have access to this event",
          });
        }
      }

      // Import CSV service
      const { importPeopleFromCsv } = await import(
        "../services/csvImportService.js"
      );

      // Import people from CSV
      const results = await importPeopleFromCsv(csvText, req.user.id);

      // Create RSVPs for imported people if eventId is provided
      let rsvpsCreated = 0;
      if (eventId && event) {
        const { supabase } = await import("../supabase.js");
        const { findPersonByEmail } = await import("../data.js");

        // Get all successfully imported people (created or updated)
        // We need to find them by email from the CSV
        const { parseCsv } = await import("../services/csvImportService.js");
        const rows = parseCsv(csvText);

        for (const row of rows) {
          const email = row["Email"] || row["email"] || row.Email;
          if (!email) continue;

          try {
            const normalizedEmail = email.trim().toLowerCase();
            const person = await findPersonByEmail(normalizedEmail);

            if (person) {
              // Check if RSVP already exists
              const { data: existingRsvp } = await supabase
                .from("rsvps")
                .select("id")
                .eq("event_id", eventId)
                .eq("person_id", person.id)
                .single();

              if (!existingRsvp) {
                // Create RSVP with CONFIRMED status (historical import)
                const { error: rsvpError } = await supabase.from("rsvps").insert({
                  person_id: person.id,
                  event_id: eventId,
                  slug: event.slug,
                  booking_status: "CONFIRMED",
                  status: "attending",
                  plus_ones: 0,
                  party_size: 1,
                  wants_dinner: false,
                });

                if (!rsvpError) {
                  rsvpsCreated++;
                }
              }
            }
          } catch (err) {
            console.error(`Error creating RSVP for ${email}:`, err);
            // Continue with next person
          }
        }
      }

      res.json({
        success: true,
        summary: {
          total: results.created + results.updated + results.errors.length,
          created: results.created,
          updated: results.updated,
          errors: results.errors.length,
          rsvpsCreated: rsvpsCreated,
        },
        errors: results.errors.slice(0, 100), // Limit to first 100 errors
      });
    } catch (error) {
      console.error("Error importing CSV:", error);
      res.status(500).json({
        error: "import_failed",
        message: error.message || "Failed to import CSV",
      });
    }
  });

  // ---------------------------
  // PROTECTED: CRM Views (requires auth)
  // ---------------------------
  app.get("/host/crm/views", requireAuth, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { data, error } = await supabase
        .from("crm_views")
        .select("*")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      res.json({ views: data || [] });
    } catch (error) {
      console.error("Error fetching CRM views:", error);
      res.status(500).json({ error: "Failed to fetch views" });
    }
  });

  app.post("/host/crm/views", requireAuth, async (req, res) => {
    try {
      const { name, filters, sortBy, sortOrder, isDefault } = req.body;

      if (!name) {
        return res.status(400).json({ error: "name is required" });
      }

      const { supabase } = await import("../supabase.js");

      // If this is set as default, unset other defaults
      if (isDefault) {
        await supabase
          .from("crm_views")
          .update({ is_default: false })
          .eq("user_id", req.user.id);
      }

      const { data, error } = await supabase
        .from("crm_views")
        .insert({
          user_id: req.user.id,
          name,
          filters: filters || {},
          sort_by: sortBy || "created_at",
          sort_order: sortOrder || "desc",
          is_default: isDefault || false,
        })
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (error) {
      console.error("Error creating CRM view:", error);
      res.status(500).json({ error: "Failed to create view" });
    }
  });

  app.put("/host/crm/views/:viewId", requireAuth, async (req, res) => {
    try {
      const { viewId } = req.params;
      const { name, filters, sortBy, sortOrder, isDefault } = req.body;

      const { supabase } = await import("../supabase.js");

      // Verify ownership
      const { data: existing } = await supabase
        .from("crm_views")
        .select("user_id")
        .eq("id", viewId)
        .single();

      if (!existing || existing.user_id !== req.user.id) {
        return res.status(404).json({ error: "View not found" });
      }

      // If this is set as default, unset other defaults
      if (isDefault) {
        await supabase
          .from("crm_views")
          .update({ is_default: false })
          .eq("user_id", req.user.id)
          .neq("id", viewId);
      }

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (filters !== undefined) updates.filters = filters;
      if (sortBy !== undefined) updates.sort_by = sortBy;
      if (sortOrder !== undefined) updates.sort_order = sortOrder;
      if (isDefault !== undefined) updates.is_default = isDefault;

      const { data, error } = await supabase
        .from("crm_views")
        .update(updates)
        .eq("id", viewId)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } catch (error) {
      console.error("Error updating CRM view:", error);
      res.status(500).json({ error: "Failed to update view" });
    }
  });

  app.delete("/host/crm/views/:viewId", requireAuth, async (req, res) => {
    try {
      const { viewId } = req.params;
      const { supabase } = await import("../supabase.js");

      // Verify ownership
      const { data: existing } = await supabase
        .from("crm_views")
        .select("user_id")
        .eq("id", viewId)
        .single();

      if (!existing || existing.user_id !== req.user.id) {
        return res.status(404).json({ error: "View not found" });
      }

      const { error } = await supabase
        .from("crm_views")
        .delete()
        .eq("id", viewId);

      if (error) throw error;
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting CRM view:", error);
      res.status(500).json({ error: "Failed to delete view" });
    }
  });
}
