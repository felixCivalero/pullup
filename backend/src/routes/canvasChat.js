// AI create-canvas chat endpoint — the in-app head on the spine: host converses,
// Claude builds the event page via the /create MCP surface.

import { findEventById, getUserEventIds } from "../data.js";
import { requireAuth } from "../middleware/auth.js";
import { buildServerInstructions } from "../mcp/httpHandler.js";
import { runCanvasTurn, getCanvasMcpToken } from "../services/canvasChat.js";

export function registerCanvasChatRoutes(app) {
  // ---------------------------
  // Create canvas chat — the in-app head on the spine. The host converses; Claude
  // builds the event page by calling our /create MCP surface (blast-radius
  // limited: it can't refund/send/delete). PullUp holds the Anthropic key; a
  // short-lived per-host PAT authorizes the connector back into our MCP.
  // ---------------------------
  app.post("/host/canvas/chat", requireAuth, async (req, res) => {
    let heartbeat = null;
    try {
      const { messages, eventId, images } = req.body || {};
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages (non-empty array) required" });
      }
      // Host-attached reference images (https URLs). They live in the shared event
      // media pool; here they become vision input + a URL the scene can animate.
      const imgUrls = Array.isArray(images)
        ? images.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 4)
        : [];

      // System prompt = the same coach instructions the connector gets, plus the
      // event the host is currently editing so Claude edits THIS one by default.
      const { supabase } = await import("../supabase.js");
      const { data: prof } = await supabase
        .from("profiles")
        .select("host_brief")
        .eq("id", req.user.id)
        .maybeSingle();
      // Stable system block (instructions + brief) — cached so repeated turns in
      // the conversation reuse the prefix. The latency killer is round-trips, so
      // we forbid the read tools: the brief and current event state are already
      // in the prompt, leaving update_event as the only call a typical edit needs.
      let stable = buildServerInstructions((prof?.host_brief || "").trim());
      stable +=
        "\n\nCANVAS MODE — you are embedded in the live event editor, not a chat window. " +
        "The brief above is already loaded; do NOT call get_host_brief. The current event's " +
        "full state is provided to you on every turn, so do NOT call get_event or list_events " +
        "to read it. Act directly and fast, then reply with ONE short confirmation sentence. " +
        "Pick the RIGHT tool:\n" +
        "• Page content, copy, colors, fonts, sections, cover photo, and a plain ABSTRACT color-wash " +
        "hero → update_event.\n" +
        "• A CUSTOM ANIMATED HERO → set_event_scene, where you WRITE the hero as self-contained " +
        "sandboxed code (canvas / WebGL / CSS / SVG). The built-in shader (brand.design archetype " +
        "'webgl') is ONLY an abstract plasma driven by a color palette + motion intensity — it CANNOT " +
        "render words or a headline, logos, shapes, photos, or any specific motion (bubbles, particles, " +
        "liquid, rain, 3D). So the MOMENT the host's hero ask names anything concrete — a word/headline " +
        "IN the hero (e.g. 'HYPERBLAST'), 3D, bubbles/particles/liquid/a specific motion, a logo or photo " +
        "treatment, or words like animation/movie/cinematic — you MUST call set_event_scene and author " +
        "the code. Do NOT approximate it by recoloring the shader with update_event, and NEVER tell the " +
        "host PullUp can't do it or to make a video elsewhere. Build it. The code MUST be responsive " +
        "(fill the container, handle resize) and collects nothing (the sandbox enforces this). Hero " +
        "only — the Register button and the rest of the page stay PullUp's trusted system. When you " +
        "call set_event_scene, also pass `palette` (the hero's dominant hex colors) so the page can " +
        "vibe-match and the still-fallback matches.\n" +
        "MAKE IT ONE PIECE: right after you build or restyle the hero, in the SAME turn call " +
        "update_event to vibe-match the body to it so the page feels designed, not stapled together — " +
        "set brand.backgroundColor to a deep tone from the hero, brand.buttonColor to a hero accent " +
        "(leave buttonTextColor to auto-contrast), and choose brand.buttonFontFamily + title/section " +
        "fonts whose MOOD fits the hero (punchy condensed/grotesk for high-energy, an elegant serif for " +
        "refined) from the curated fonts. Keep it tasteful and legible. And give the page music: if the " +
        "event already has a Spotify link, add a 'spotify' section so it plays inline; if not, ask the " +
        "host to drop their Spotify link and add it then — never invent a URL. Treat this vibe-match as " +
        "part of designing the event, not a separate chore.\n" +
        "VOICE: reply in plain, conversational text — NO markdown (no **bold**, no bullet or " +
        "heading syntax) and NO links or URLs. You live inside the editor and the live preview " +
        "updates right next to the host as you work, so NEVER tell them to 'preview', 'open', or " +
        "click a link — just say what you changed and, if useful, the one next thing worth doing.";

      const systemBlocks = [
        { type: "text", text: stable, cache_control: { type: "ephemeral" } },
      ];

      // Volatile event state goes in its own block *after* the cached breakpoint
      // (it changes every time the host builds), so it never invalidates the cache.
      if (eventId) {
        const ownedIds = await getUserEventIds(req.user.id);
        const ev = ownedIds.includes(eventId) ? await findEventById(eventId) : null;
        if (ev) {
          const ctx = {
            title: ev.title,
            slug: ev.slug,
            status: ev.status,
            description: ev.description || "",
            location: ev.location || "",
            startsAt: ev.startsAt || "",
            endsAt: ev.endsAt || "",
            brand: ev.brand || null,
            titleSettings: ev.titleSettings || null,
            sections: Array.isArray(ev.sections)
              ? ev.sections.map((s) => ({
                  type: s.type,
                  ...(s.title ? { title: s.title } : {}),
                  ...(s.url ? { url: s.url } : {}),
                  ...(s.text ? { text: String(s.text).slice(0, 120) } : {}),
                }))
              : [],
          };
          systemBlocks.push({
            type: "text",
            text:
              "CURRENT EVENT STATE — the host is editing THIS event right now. Edit it with " +
              "update_event using its slug; do not re-read it.\n```json\n" +
              JSON.stringify(ctx, null, 2) +
              "\n```",
          });
        }
      }

      // Reference images: tell the model it can SEE them (vision, below) and give
      // it their URLs to USE — the hero should treat/animate the host's actual
      // image, not ignore it.
      if (imgUrls.length) {
        systemBlocks.push({
          type: "text",
          text:
            "The host attached reference image(s) — you can SEE them in the latest message. " +
            "Build the HERO by treating/animating THESE image(s): draw them to a canvas and add " +
            "motion (parallax, drift, light sweeps, particles, grain) so the host's real image comes " +
            "alive — keep it the subject, don't replace it with an abstract scene. Reference them in " +
            "the scene code by these https URLs (img-src allows https): " + imgUrls.join(", "),
        });
      }

      // Attach the images to the LAST user message as vision blocks so the model
      // actually sees them. Frontend sends content as a string; we widen it here.
      let effectiveMessages = messages;
      if (imgUrls.length) {
        effectiveMessages = messages.map((m) => ({ ...m }));
        for (let i = effectiveMessages.length - 1; i >= 0; i--) {
          if (effectiveMessages[i].role === "user") {
            const txt = typeof effectiveMessages[i].content === "string" ? effectiveMessages[i].content : "";
            effectiveMessages[i] = {
              role: "user",
              content: [
                { type: "text", text: txt || "Use the attached image for the hero." },
                ...imgUrls.map((url) => ({ type: "image", source: { type: "url", url } })),
              ],
            };
            break;
          }
        }
      }

      const mcpToken = await getCanvasMcpToken(req.user.id);
      const mcpBaseUrl = process.env.MCP_PUBLIC_BASE_URL || "https://mcp.pullup.se";

      // Generative scenes can run past a 60s gateway read-timeout (→504). Stream
      // an NDJSON response and emit a heartbeat newline every 15s so the proxy
      // keeps the connection open while the model writes the scene. The FINAL
      // non-empty line carries the real payload (or an {error}); blank lines are
      // just keepalive. HTTP status is already 200 once we start streaming.
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no"); // ask nginx not to buffer
      res.flushHeaders?.();
      heartbeat = setInterval(() => {
        try { res.write("\n"); } catch { /* socket gone */ }
      }, 15000);

      let turn;
      try {
        turn = await runCanvasTurn({
          messages: effectiveMessages,
          system: systemBlocks,
          mcpToken,
          mcpBaseUrl,
          // Narrate real actions live (Claude-Code feel) — each tool the model
          // starts becomes a status line the dock shows as it happens.
          onProgress: (text) => {
            try { res.write(JSON.stringify({ type: "status", text }) + "\n"); } catch { /* socket gone */ }
          },
        });
      } finally {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      const { reply, toolsUsed, toolsFailed, toolsUnrun, stopReason, diag } = turn;

      // TEMP boundary diagnostic: the canvas turn's true response shape.
      try {
        supabase
          .from("mcp_tool_calls")
          .insert({
            user_id: req.user.id,
            tool_name: "canvas_diag",
            ok: (toolsUnrun || []).length === 0,
            duration_ms: 0,
            error_excerpt: JSON.stringify(diag || {}).slice(0, 240),
          })
          .then(() => {}, () => {});
      } catch { /* never block the turn */ }

      res.write(
        JSON.stringify({ type: "result", reply, toolsUsed, toolsFailed, toolsUnrun, stopReason, eventId: eventId || null }) + "\n",
      );
      res.end();
    } catch (err) {
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      console.error("[canvas/chat]", err?.message || err);
      // TEMP: capture the real failure to the DB (prod logs unreachable here).
      try {
        const { supabase: sb } = await import("../supabase.js");
        const detail = `${err?.name || "Error"}: ${err?.message || err}${err?.status ? ` [status:${err.status}]` : ""}`;
        sb.from("mcp_tool_calls")
          .insert({
            user_id: req.user?.id || null,
            tool_name: "canvas_error",
            ok: false,
            duration_ms: 0,
            error_excerpt: String(detail).slice(0, 240),
          })
          .then(() => {}, () => {});
      } catch { /* swallow */ }
      // Deliver the error as a final NDJSON line if we already started streaming;
      // otherwise a normal JSON error response still works.
      if (res.headersSent) {
        try { res.write(JSON.stringify({ type: "error", error: "Canvas chat failed. Try again." }) + "\n"); } catch {}
        try { res.end(); } catch {}
      } else {
        res.status(500).json({ error: "Canvas chat failed. Try again." });
      }
    }
  });
}
