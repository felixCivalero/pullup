import { useState, useRef, useEffect } from "react";
import { Send, Sparkles } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
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

export function CanvasChat({ eventId, suggestions = [] }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // live "what the AI is doing now"
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // `override` lets a chip send its prompt directly; the composer sends `input`.
  async function send(override) {
    const text = (typeof override === "string" ? override : input).trim();
    if (!text || sending) return;
    setError(null);
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    if (typeof override !== "string") setInput("");
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

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", paddingTop: 8, borderTop: `1px solid ${colors.borderFaint}` }}>
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
          disabled={sending || !input.trim()}
          aria-label="Send"
          style={{
            flexShrink: 0,
            width: 38,
            height: 38,
            borderRadius: 10,
            border: "none",
            background: input.trim() && !sending ? colors.accent : colors.surfaceMuted,
            color: input.trim() && !sending ? "#fff" : colors.textFaded,
            cursor: input.trim() && !sending ? "pointer" : "default",
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
