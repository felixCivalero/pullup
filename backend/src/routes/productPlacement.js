// Product placement routes — the host's controls for "where does this product
// show". The showcase READ payloads ride along in the room views (event room
// view + person-room payload); these routes are the host-only management surface
// plus the global product library list.
//
// A product is an events row kind='product'. Ownership is enforced with
// canEditEvent on BOTH the room (event) and the product (events row).

import { requireAuth } from "../middleware/auth.js";
import { canEditEvent } from "../repos/eventAccess.js";
import { findEventById } from "../repos/events.js";
import {
  listHostProducts,
  listEventRoomProducts,
  assignProductToRoom,
  removeProductFromRoom,
  reorderRoomProducts,
  setProductMainRoomHidden,
} from "../services/productPlacement.js";

export function registerProductPlacementRoutes(app) {
  // The host's whole product library (live + draft) with stats. Powers the
  // "Your products" card on the host home and the room manage picker.
  app.get("/host/products", requireAuth, async (req, res) => {
    try {
      const products = await listHostProducts(req.user.id);
      res.json({ products });
    } catch (err) {
      console.error("[GET /host/products]", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // The manage view for one event room: what's assigned (host cards) + the full
  // library to pick from.
  app.get("/host/events/:eventId/room-products", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      if (!(await canEditEvent(req.user.id, eventId))) return res.status(403).json({ error: "Forbidden" });
      const [assigned, library] = await Promise.all([
        listEventRoomProducts(eventId, { forHost: true }),
        listHostProducts(req.user.id),
      ]);
      res.json({ assigned, library });
    } catch (err) {
      console.error("[GET /host/events/:eventId/room-products]", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // Add a product to an event room.
  app.post("/host/events/:eventId/room-products", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { productEventId } = req.body || {};
      if (!productEventId) return res.status(400).json({ error: "productEventId required" });
      if (!(await canEditEvent(req.user.id, eventId))) return res.status(403).json({ error: "Forbidden" });
      if (!(await canEditEvent(req.user.id, productEventId))) return res.status(403).json({ error: "Forbidden" });
      const product = await findEventById(productEventId);
      if (!product || product.kind !== "product") return res.status(400).json({ error: "Not a product" });
      await assignProductToRoom({ hostId: req.user.id, eventId, productEventId });
      const assigned = await listEventRoomProducts(eventId, { forHost: true });
      res.json({ ok: true, assigned });
    } catch (err) {
      console.error("[POST /host/events/:eventId/room-products]", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // Remove a product from an event room.
  app.delete("/host/events/:eventId/room-products/:productEventId", requireAuth, async (req, res) => {
    try {
      const { eventId, productEventId } = req.params;
      if (!(await canEditEvent(req.user.id, eventId))) return res.status(403).json({ error: "Forbidden" });
      await removeProductFromRoom({ eventId, productEventId });
      const assigned = await listEventRoomProducts(eventId, { forHost: true });
      res.json({ ok: true, assigned });
    } catch (err) {
      console.error("[DELETE /host/events/:eventId/room-products/:productEventId]", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // Reorder a room's products.
  app.put("/host/events/:eventId/room-products/order", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { order } = req.body || {};
      if (!(await canEditEvent(req.user.id, eventId))) return res.status(403).json({ error: "Forbidden" });
      await reorderRoomProducts({ eventId, order });
      const assigned = await listEventRoomProducts(eventId, { forHost: true });
      res.json({ ok: true, assigned });
    } catch (err) {
      console.error("[PUT /host/events/:eventId/room-products/order]", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });

  // Toggle a product's main-room visibility (the implicit-placement opt-out).
  app.put("/host/products/:productEventId/main-room", requireAuth, async (req, res) => {
    try {
      const { productEventId } = req.params;
      const { hidden } = req.body || {};
      if (!(await canEditEvent(req.user.id, productEventId))) return res.status(403).json({ error: "Forbidden" });
      await setProductMainRoomHidden({ productEventId, hidden: !!hidden });
      res.json({ ok: true, hideFromMainRoom: !!hidden });
    } catch (err) {
      console.error("[PUT /host/products/:productEventId/main-room]", err);
      res.status(500).json({ error: err.message || "Internal error" });
    }
  });
}
