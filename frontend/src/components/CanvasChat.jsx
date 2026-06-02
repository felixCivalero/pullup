import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, ImagePlus, X } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { uploadEventMediaDirect } from "../lib/imageUtils.js";
import { colors } from "../theme/colors.js";

// The create canvas: the host talks, Claude builds the event page through our
// /create MCP surface (server-side), and the live EventPreview refreshes in
// place. Chat-first — the conversation owns the panel; calibrated coach
// suggestions appear as quick-tap chips above the composer that just send a
// prompt, so everything routes through the one chat surface.

// A tool call changed the event if it isn't a pure read. Reads start with these
// prefixes; anything else (create/update/upload/publish) means the preview
// should refresh.
function isMutatingTool(name) {
  return !(
    name.startsWith("get_") ||
    name.startsWith("list_") ||
    name.startsWith("find_") ||
    name.startsWith("query_") ||
    name.startsWith("suggest_") ||
    name.startsWith("audit_")
  );
}

// The AI lives inside the editor — replies should read native, not like chat
// markup. The system prompt already asks for plain text; this is the safety net
// that strips a stray markdown link or bold so the host never sees raw syntax.
function nativeText(s) {
  return String(s || "")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]*\)/g, "$1") // [label](url) → label
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold** → bold
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "") // strip heading markers
    .trim();
}

// A live "working" indicator. `label` is the AI's real, streamed status for
// the step it's on right now (e.g. "Designing your hero — writing the
// animation…"); animated dots keep it feeling alive. Falls back to "Thinking"
// before the first status arrives.
function WorkingIndicator({ label }) {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const d = setInterval(() => setDots((x) => (x % 3) + 1), 420);
    return () => clearInterval(d);
  }, []);
  return (
    <div
      style={{
        alignSelf: "flex-start",
        display: "flex",
        alignItems: "center",
        gap: 7,
        background: colors.surfaceMuted,
        color: colors.textMuted,
        borderRadius: 12,
        padding: "8px 11px",
        fontSize: 13,
      }}
    >
      <Sparkles size={13} style={{ color: colors.accent }} />
      <span>
        {label || "Thinking"}
        <span style={{ opacity: 0.6 }}>{".".repeat(dots)}</span>
      </span>
    </div>
  );
}

export function CanvasChat({ eventId, suggestions = [], seed = null }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // live "what the AI is doing now"
  const [error, setError] = useState(null);
  const [attachments, setAttachments] = useState([]); // [{url}] reference images
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  // Attach an image in the chat. It goes into the SHARED event-media pool (so it
  // also shows in the MEDIA tab — one image, both places), and its URL rides the
  // next message so the AI can SEE it (vision) and animate/treat it in the hero.
  async function attachImage(file) {
    if (!file || !eventId) return;
    if (!file.type || !file.type.startsWith("image/")) {
      setError("Please attach an image.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const rec = await uploadEventMediaDirect({ eventId, file, mediaType: "image" });
      const url = rec?.url || rec?.thumbnailUrl;
      if (!url) throw new Error("Upload didn't return a URL.");
      setAttachments((a) => [...a, { url }]);
      // It's now event media → mirror it into the MEDIA tab (re-hydrate).
      window.dispatchEvent(
        new CustomEvent("pullup:canvas-built", { detail: { eventId, tools: ["upload_event_media"] } }),
      );
    } catch (e) {
      setError(e?.message || "Couldn't add that image.");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // Seeded prompt (e.g. the create page's "build the look" offer): drop it in
  // the composer for the host to review and send. We draft, we don't auto-fire.
  useEffect(() => {
    if (seed?.text) setInput(seed.text);
  }, [seed?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // `override` lets a chip send its prompt directly; the composer sends `input`.
  async function send(override) {
    const text = (typeof override === "string" ? override : input).trim();
    const imgs = attachments.map((a) => a.url);
    if ((!text && imgs.length === 0) || sending) return;
    setError(null);
    const userText = text || "Use the attached image for the hero.";
    const next = [...messages, { role: "user", content: userText, images: imgs }];
    setMessages(next);
    if (typeof override !== "string") setInput("");
    setAttachments([]);
    setSending(true);
    setStatus(null);
    try {
      // Flush the editor's unsaved form edits into the draft first, so the AI
      // builds on top of what the host just typed — not a stale server copy.
      // Resolves immediately if no editor is listening (timeout guard).
      await new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          window.removeEventListener("pullup:canvas-flush-done", done);
          resolve();
        };
        window.addEventListener("pullup:canvas-flush-done", done);
        window.dispatchEvent(new CustomEvent("pullup:canvas-flush-request"));
        setTimeout(done, 2000);
      });
      const res = await authenticatedFetch("/host/canvas/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          eventId: eventId || null,
          images: imgs,
        }),
      });
      // The endpoint streams NDJSON, one JSON object per line:
      //   {type:"status", text}  → narrate the step the AI is on, live
      //   {type:"result", ...}   → the final payload
      //   {type:"error", error}  → failure
      // (blank heartbeat lines just keep the gateway alive). Read incrementally
      // so status updates land as they happen.
      let data = null;
      const handleLine = (line) => {
        const t = line.trim();
        if (!t) return;
        let obj;
        try { obj = JSON.parse(t); } catch { return; }
        if (obj.type === "status") setStatus(obj.text);
        else if (obj.type === "error") throw new Error(obj.error || "Canvas couldn't respond. Try again.");
        else data = obj; // result (typed) or legacy untyped payload
      };
      const reader = res.body?.getReader?.();
      if (reader) {
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            handleLine(buf.slice(0, nl));
            buf = buf.slice(nl + 1);
          }
        }
        if (buf) handleLine(buf);
      } else {
        // Fallback for environments without a readable body stream.
        const rawBody = await res.text();
        rawBody.split("\n").forEach(handleLine);
      }
      if (!data) throw new Error("Canvas couldn't respond. Try again.");
      if (data.error) throw new Error(data.error);
      const tools = Array.isArray(data.toolsUsed) ? data.toolsUsed : [];
      const failed = Array.isArray(data.toolsFailed) ? data.toolsFailed : [];
      const unrun = Array.isArray(data.toolsUnrun) ? data.toolsUnrun : [];
      const built = tools.some(isMutatingTool);
      // A mutating tool the model tried but that errored OR never executed
      // (connector didn't run it) — be honest rather than claim a phantom change.
      const failedMutation = !built && (failed.some(isMutatingTool) || unrun.some(isMutatingTool));
      setMessages((m) => [...m, { role: "assistant", content: nativeText(data.reply) || "Done.", tools, failedMutation }]);
      if (built) {
        window.dispatchEvent(new CustomEvent("pullup:canvas-built", { detail: { eventId, tools } }));
      }
    } catch (err) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setSending(false);
      setStatus(null);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: "auto", padding: "4px 2px", display: "flex", flexDirection: "column", gap: 10 }}
      >
        {messages.length === 0 ? (
          <div style={{ margin: "auto 0", color: colors.textMuted, fontSize: 13.5, lineHeight: 1.55, padding: "8px 4px", textAlign: "center" }}>
            <Sparkles size={18} style={{ color: colors.accent, marginBottom: 6 }} />
            <div style={{ color: colors.text, fontWeight: 600, marginBottom: 4 }}>Build your page by chatting</div>
            <div>Describe the change — "neon launch party at The Alchemist" or "add a Spotify player." The preview updates live.</div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                background: m.role === "user" ? colors.accent : colors.surfaceMuted,
                color: m.role === "user" ? "#fff" : colors.text,
                borderRadius: 12,
                padding: "8px 11px",
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {m.content}
              {m.failedMutation ? (
                <div style={{ marginTop: 5, fontSize: 11, color: colors.danger }}>
                  Couldn't apply that — try again
                </div>
              ) : m.tools?.some(isMutatingTool) ? (
                <div style={{ marginTop: 5, fontSize: 11, color: m.role === "user" ? "rgba(255,255,255,0.8)" : colors.textMuted }}>
                  ✓ updated the page
                </div>
              ) : null}
            </div>
          ))
        )}
        {sending && <WorkingIndicator label={status} />}
      </div>

      {error && <div style={{ color: colors.danger, fontSize: 12, padding: "4px 6px" }}>{error}</div>}

      {suggestions.length > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 2px 2px", scrollbarWidth: "none" }}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => send(s.prompt)}
              disabled={sending}
              title={s.prompt}
              style={{
                flexShrink: 0,
                whiteSpace: "nowrap",
                maxWidth: 210,
                overflow: "hidden",
                textOverflow: "ellipsis",
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${colors.accentBorder}`,
                background: colors.accentSoft,
                color: colors.accentText,
                fontSize: 12,
                fontWeight: 600,
                cursor: sending ? "default" : "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {(attachments.length > 0 || uploading) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "8px 2px 0" }}>
          {attachments.map((a, i) => (
            <div key={i} style={{ position: "relative", width: 46, height: 46, borderRadius: 8, overflow: "hidden", border: `1px solid ${colors.border}` }}>
              <img src={a.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <button
                type="button"
                onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                aria-label="Remove image"
                style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: 999, border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {uploading && <span style={{ fontSize: 12, color: colors.textMuted }}>Adding image…</span>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", paddingTop: 8, borderTop: `1px solid ${colors.borderFaint}` }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) attachImage(f); e.target.value = ""; }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || sending}
          aria-label="Attach an image"
          title="Attach an image — it joins your media and the AI can animate it"
          style={{
            flexShrink: 0,
            width: 38,
            height: 38,
            borderRadius: 10,
            border: `1px solid ${colors.border}`,
            background: colors.background,
            color: uploading || sending ? colors.textFaded : colors.textMuted,
            cursor: uploading || sending ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ImagePlus size={16} />
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Tell me what to build…"
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            padding: "9px 11px",
            fontSize: 13,
            fontFamily: "inherit",
            color: colors.text,
            background: colors.background,
            maxHeight: 120,
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={sending || (!input.trim() && attachments.length === 0)}
          aria-label="Send"
          style={{
            flexShrink: 0,
            width: 38,
            height: 38,
            borderRadius: 10,
            border: "none",
            background: (input.trim() || attachments.length) && !sending ? colors.accent : colors.surfaceMuted,
            color: (input.trim() || attachments.length) && !sending ? "#fff" : colors.textFaded,
            cursor: (input.trim() || attachments.length) && !sending ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
