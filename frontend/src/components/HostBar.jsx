// HostBar — the floating pill the MCP coach drops onto a preview URL.
//
// Mounts on the event page and the campaign preview page. Inert unless
// the URL carries ?pv=<jwt>. Token-only fetch of /widget/config tells
// the bar what to render; actions require a host session AND that the
// signed-in user is the same host the token was minted for.
//
// Designed to be inert chrome today and a coaching surface tomorrow:
// slots.future is reserved for the in-widget prompt input. The auth /
// state machinery the prompt would need is already wired here.

import { useEffect, useState, useCallback } from "react";
import { Sparkles, Pencil, Check, Send, EyeOff, Video } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { colors } from "../theme/colors.js";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  ((import.meta.env.VITE_NODE_ENV || "").toLowerCase() === "development" ||
  import.meta.env.DEV
    ? "http://localhost:3001"
    : "/api");

const FUTURE_PROMPT_ENABLED =
  (import.meta.env.VITE_WIDGET_PROMPT_INPUT || "").toLowerCase() === "true";

export function HostBar() {
  const token = useTokenFromUrl();
  const [config, setConfig] = useState(null);
  const [hasSession, setHasSession] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const resp = await fetch(
        `${API_BASE}/widget/config?token=${encodeURIComponent(token)}`,
      );
      const body = await resp.json();
      if (body?.ok) {
        setConfig(body);
        setError(null);
      } else {
        setConfig(null);
        setError(body?.error || "Preview link expired");
      }
    } catch (err) {
      setConfig(null);
      setError(err.message || "Couldn't reach the widget service");
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    reload();
  }, [token, reload]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setHasSession(!!data?.session?.access_token);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (mounted) setHasSession(!!session?.access_token);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [token]);

  const dropActive = !!(token && config?.ok && config?.resource?.kind === "event");
  const drop = useDropToUpload({
    enabled: dropActive,
    token,
    hasSession,
    onComplete: () => window.location.reload(),
  });

  if (!token) return null;
  if (!config && !error) return null;

  const act = async (action) => {
    if (!hasSession) {
      window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    setActing(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const resp = await fetch(`${API_BASE}/widget/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data?.session?.access_token || ""}`,
        },
        body: JSON.stringify({ token, action }),
      });
      const body = await resp.json();
      if (!body?.ok) {
        setError(body?.error || `Action failed (${resp.status})`);
        setActing(false);
        return;
      }
      // Reload the page so the user sees the result of their action.
      // For campaign send, reload the config (we're not on the live page).
      if (config?.resource?.kind === "event") {
        window.location.reload();
      } else {
        await reload();
        setActing(false);
      }
    } catch (err) {
      setError(err.message || "Action failed");
      setActing(false);
    }
  };

  const slots = buildSlots({ config, error, hasSession, acting, onAct: act });

  return (
    <>
      {drop.overlay}
      <div
        style={{
          position: "fixed",
          bottom: "max(16px, env(safe-area-inset-bottom))",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 2147483000,
          background: "rgba(12,12,14,0.92)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)",
          border: `1px solid rgba(245, 158, 11, 0.25)`,
          borderRadius: 999,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: colors?.text || "#f5f5f5",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif",
          fontSize: 13,
          lineHeight: 1.2,
          boxShadow: "0 12px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.4)",
          maxWidth: "calc(100vw - 24px)",
        }}
      >
        <Sparkles size={14} color={colors?.gold || "#fbbf24"} />
        {slots.primary}
        {slots.coverChip}
        {slots.secondary}
        {FUTURE_PROMPT_ENABLED && slots.future}
      </div>
    </>
  );
}

// Window-level drag-drop → upload-as-cover. Active only while we have a
// valid event token. Renders a translucent gold overlay while a file is
// dragged over the page; on drop, reads the file as a data URL and POSTs
// to /widget/upload-content. On success, reload to show the new cover.
function useDropToUpload({ enabled, token, hasSession, onComplete }) {
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    let counter = 0;
    const isFileDrag = (e) =>
      Array.from(e.dataTransfer?.types || []).includes("Files");
    const onDragEnter = (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      counter += 1;
      setHover(true);
    };
    const onDragOver = (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
    };
    const onDragLeave = (e) => {
      if (!isFileDrag(e)) return;
      counter -= 1;
      if (counter <= 0) {
        counter = 0;
        setHover(false);
      }
    };
    const onDrop = async (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      counter = 0;
      setHover(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!hasSession) {
        window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return;
      }
      const mime = file.type || "";
      const isImage = mime.startsWith("image/");
      const isVideo = mime.startsWith("video/");
      if (!isImage && !isVideo) {
        setErrorMsg("Only images and videos");
        setTimeout(() => setErrorMsg(null), 2500);
        return;
      }
      // 75MB inline cap — comfortably under the json body limit while
      // letting most phone clips through. Bigger files belong in the
      // in-app editor with the signed-upload-URL flow.
      if (file.size > 75 * 1024 * 1024) {
        setErrorMsg("File >75MB — use the in-app editor");
        setTimeout(() => setErrorMsg(null), 3500);
        return;
      }
      setBusy(true);
      setErrorMsg(null);
      try {
        const dataUrl = await readAsDataUrl(file);
        const { data } = await supabase.auth.getSession();
        const resp = await fetch(`${API_BASE}/widget/upload-content`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data?.session?.access_token || ""}`,
          },
          body: JSON.stringify({
            token,
            dataUrl,
            mediaType: isVideo ? "video" : "image",
          }),
        });
        const body = await resp.json().catch(() => ({}));
        if (!body?.ok) {
          setErrorMsg(body?.error || `Upload failed (${resp.status})`);
          setBusy(false);
          setTimeout(() => setErrorMsg(null), 3500);
          return;
        }
        onComplete?.();
      } catch (err) {
        setErrorMsg(err.message || "Upload failed");
        setBusy(false);
        setTimeout(() => setErrorMsg(null), 3500);
      }
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [enabled, token, hasSession, onComplete]);

  const visible = enabled && (hover || busy || errorMsg);
  const overlay = visible ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147482000,
        pointerEvents: "none",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
        border: `3px dashed ${errorMsg ? "#f87171" : "#fbbf24"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "opacity 120ms ease",
      }}
    >
      <div
        style={{
          padding: "16px 22px",
          borderRadius: 14,
          background: "rgba(12,12,14,0.92)",
          border: `1px solid ${errorMsg ? "rgba(248,113,113,0.5)" : "rgba(245,158,11,0.45)"}`,
          color: errorMsg ? "#fecaca" : "#fde68a",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif",
          fontSize: 15,
          fontWeight: 500,
        }}
      >
        {errorMsg
          ? errorMsg
          : busy
            ? "Uploading…"
            : "Drop to add as cover · video > photo"}
      </div>
    </div>
  ) : null;

  return { overlay };
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("read_failed"));
    r.readAsDataURL(file);
  });
}

function useTokenFromUrl() {
  const [token, setToken] = useState(() => readToken());
  useEffect(() => {
    const onChange = () => setToken(readToken());
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);
  return token;
}
function readToken() {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  return p.get("pv");
}

function buildSlots({ config, error, hasSession, acting, onAct }) {
  if (error) {
    return {
      primary: (
        <span style={{ opacity: 0.85, fontSize: 12 }}>
          {humanError(error)}
        </span>
      ),
      secondary: null,
      future: null,
    };
  }

  const caps = config?.capabilities || [];
  const resource = config?.resource || {};
  const kind = resource.kind;
  const status = (resource.status || "").toLowerCase();

  let primary = null;
  if (kind === "event") {
    if (caps.includes("publish") && status === "draft") {
      primary = (
        <PrimaryButton
          onClick={() => onAct("publish")}
          disabled={acting}
          icon={<Check size={14} />}
          label={acting ? "Publishing…" : "Publish"}
        />
      );
    } else if (caps.includes("unpublish") && status === "published") {
      primary = (
        <PrimaryButton
          onClick={() => onAct("unpublish")}
          disabled={acting}
          icon={<EyeOff size={14} />}
          label={acting ? "Unpublishing…" : "Unpublish"}
          tone="muted"
        />
      );
    }
  } else if (kind === "campaign") {
    if (caps.includes("send") && status === "draft") {
      const audience = resource.totalRecipients;
      primary = (
        <PrimaryButton
          onClick={() => onAct("send")}
          disabled={acting}
          icon={<Send size={14} />}
          label={acting ? "Sending…" : `Send to ${audience || "audience"}`}
        />
      );
    } else if (kind === "campaign" && status !== "draft") {
      primary = (
        <span style={{ opacity: 0.85, fontSize: 12 }}>
          Campaign {status}
        </span>
      );
    }
  }

  if (!primary && kind === "event") {
    // Published event with no actionable capability (e.g. unpublish missing):
    // still show the resource so the host knows the widget is alive.
    primary = (
      <span style={{ opacity: 0.85, fontSize: 12 }}>
        {resource.title || resource.slug} · {status}
      </span>
    );
  }

  // Edit drops the host into the in-app event editor so they can do the
  // visual things the coach can't drive from chat (cover crop, theme,
  // section ordering). Same tab — the preview URL we came from is the
  // edit page's "back" target.
  const editHref = kind === "event" && resource.id
    ? `/app/events/${resource.id}/edit`
    : null;
  const secondary = editHref ? (
    <a href={editHref} style={ghostButtonStyle} title="Open the in-app editor">
      <Pencil size={13} />
      <span>Edit</span>
    </a>
  ) : null;

  // Nudge for content only when the event has none. Tilted toward video
  // on purpose — a 10–20s clip shot for this event beats a stock photo
  // every time. Destination is the in-app editor (cover + media live there).
  const coverChip =
    kind === "event" && resource.hasCover === false && editHref ? (
      <a
        href={editHref}
        style={{ ...ghostButtonStyle, color: "#fde68a" }}
        title="A short vertical video lands harder than a still — but anything beats nothing"
      >
        <Video size={13} />
        <span>Add content</span>
      </a>
    ) : null;

  const future = (
    <div
      data-slot="future"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        opacity: 0.6,
        fontSize: 12,
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        paddingLeft: 10,
      }}
    >
      <span>Talk to coach (coming)</span>
    </div>
  );

  if (!hasSession && primary) {
    // Replace the primary with a sign-in nudge — the button still works
    // (it'll route to /login) but the label tells the user why.
    return {
      primary: (
        <PrimaryButton
          onClick={() => onAct("publish")}
          disabled={false}
          icon={<Check size={14} />}
          label="Sign in to act"
          tone="muted"
        />
      ),
      secondary,
      coverChip,
      future,
    };
  }

  return { primary, secondary, coverChip, future };
}

function PrimaryButton({ onClick, disabled, icon, label, tone = "gold" }) {
  const gold = tone === "gold";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 999,
        border: gold
          ? "1px solid rgba(245,158,11,0.6)"
          : "1px solid rgba(255,255,255,0.15)",
        background: gold ? "rgba(245,158,11,0.18)" : "transparent",
        color: gold ? "#fde68a" : "#f5f5f5",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

const ghostButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "transparent",
  color: "rgba(255,255,255,0.78)",
  cursor: "pointer",
  fontSize: 12,
};

function humanError(code) {
  switch (code) {
    case "Token expired":
      return "Preview link expired — refresh from your coach";
    case "Invalid token":
      return "This preview link looks malformed";
    case "event_not_found":
    case "campaign_not_found":
      return "Couldn't find that draft anymore";
    case "wrong_host":
    case "not_owner":
      return "Signed in as a different host";
    default:
      return code;
  }
}
