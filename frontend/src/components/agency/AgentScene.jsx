import { useEffect, useRef, useState } from "react";
import { useT } from "./i18n.js";
import { NEGATIVE_GRADIENT, NEGATIVE_LINEAR } from "./EventWorld.jsx";

/* The event tool page's agent scene: a pinned stretch where a conversation
   with "your AI" plays out as you scroll. Each tool call it makes is a real
   PullUp action (backend/src/actions), shown as a grey hardware chip, and the
   event page beside it changes with them: a draft, then live, then filling.
   Scrubbed both ways. Every line is in the markup (shown or not), so the
   pre-rendered page and reduced motion read the whole exchange. */

const SCRIPT = [
  { at: 0.04, who: "you", text: "Put my release party on PullUp: Saturday 7 November, 19:00 at Slakthusområdet, 120 spots." },
  { at: 0.12, who: "tool", tool: "create_event", text: "Draft saved" },
  { at: 0.2, who: "ai", text: "Done, it's saved as a draft. Want me to publish it?" },
  { at: 0.32, who: "you", text: "Yes. Then write an invitation to everyone who said yes to hearing from us." },
  { at: 0.4, who: "tool", tool: "publish_event", text: "pullup.se/e/release-party" },
  { at: 0.46, who: "tool", tool: "list_people", text: "214 said yes to invitations" },
  { at: 0.52, who: "tool", tool: "preview_mail", text: "Invitation ready" },
  { at: 0.58, who: "ai", text: "Published. The invitation to the 214 is ready, here's how it looks. Send it?" },
  { at: 0.7, who: "you", text: "Send." },
  { at: 0.76, who: "tool", tool: "send_mail", text: "214 sent" },
  { at: 0.84, who: "tool", tool: "get_event_stats", text: "38 signed up" },
  { at: 0.9, who: "ai", text: "Sent. 38 have signed up so far. Ask me any time how it's going." },
];

export function AgentScene({ children }) {
  const t = useT();
  const wrap = useRef(null);
  const log = useRef(null);
  const [shown, setShown] = useState(SCRIPT.length);
  const [p, setP] = useState(1);

  useEffect(() => {
    const box = wrap.current;
    if (!box) return undefined;
    let raf = 0;
    const read = () => {
      raf = 0;
      const r = box.getBoundingClientRect();
      const k = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - window.innerHeight)));
      setP(Math.round(k * 100) / 100);
      setShown(SCRIPT.filter((s) => k >= s.at).length);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Keep the newest line in view inside the chat window.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [shown]);

  const live = shown >= 5;
  const signed = shown >= 11 ? 38 : 0;
  const busy = shown < SCRIPT.length && SCRIPT[shown]?.who !== "you" && shown > 0;

  return (
    <section className="ag" ref={wrap} data-pc-tone="dark" data-pc-section="agents" data-pc-order="2">
      <div className="ag-pin">
        <div className="ag-copy">
          {children}
          <div className={`ag-page${shown >= 2 ? " is-on" : ""}`} aria-hidden="true">
            <div className="ag-cover"><span>{t("Release party")}</span></div>
            <div className="ag-page-body">
              <em className={live ? "is-live" : ""}>{live ? t("Live") : t("Draft")}</em>
              <b>{t("Release party")}</b>
              <small>{t("Sat 7 Nov · 19:00 · Slakthusområdet")}</small>
              <div className="ag-meter"><i style={{ width: `${(signed / 120) * 100}%` }} /></div>
              <small className="ag-count">{t(`${signed} of 120 coming`)}</small>
            </div>
          </div>
        </div>
        <div className="ag-stage" aria-label={t("Example conversation")}>
          <div className="ag-win">
            <div className="ag-bar">
              <span><i className="ag-led" aria-hidden="true" />{t("Your AI")}</span>
              <b>mcp.pullup.se</b>
            </div>
            <div className="ag-log" ref={log}>
              {SCRIPT.map((s, i) => (
                <div key={i} className={`ag-line is-${s.who}${i < shown ? " is-on" : ""}`}>
                  {s.who === "tool" ? (
                    <span className="ag-tool"><code>{s.tool}</code><em>{t(s.text)}</em><i aria-hidden="true">✓</i></span>
                  ) : (
                    <p>{t(s.text)}</p>
                  )}
                </div>
              ))}
              {busy && <div className="ag-typing" aria-hidden="true"><i /><i /><i /></div>}
            </div>
            <div className="ag-input" aria-hidden="true"><span>{t("Ask your AI…")}</span><b>↑</b></div>
          </div>
          <div className="ag-progress" aria-hidden="true"><i style={{ width: `${p * 100}%` }} /></div>
        </div>
      </div>
    </section>
  );
}

export const AGENT_CSS = `
  .ag { --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace; position: relative; height: 260vh; background: #0a0a0a; color: #fff; }
  .ag-pin { position: sticky; top: 0; height: 100svh; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); align-items: center; gap: clamp(28px, 4vw, 72px); padding: 96px clamp(20px, 3.4vw, 48px) 40px; box-sizing: border-box; overflow: hidden; }
  .ag-stage { position: relative; height: min(78svh, 680px); display: grid; }
  .ag-win { position: relative; z-index: 1; display: flex; flex-direction: column; min-height: 0; width: min(100%, 600px); justify-self: end; border-radius: 12px; overflow: hidden; background: #121212; border: 1px solid #2c2c2c; box-shadow: 0 40px 100px -30px rgba(232,96,74,.4); }
  .ag-bar { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; background: linear-gradient(180deg, #e4e3df, #cfcec9); color: #111; border-bottom: 1px solid #8f8e89; font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .ag-bar span { display: inline-flex; align-items: center; gap: 8px; }
  .ag-bar b { padding: 3px 7px; border: 1px solid rgba(0,0,0,.35); border-radius: 4px; background: rgba(255,255,255,.4); font-size: 11px; letter-spacing: .02em; text-transform: none; }
  .ag-led { width: 7px; height: 7px; border-radius: 50%; background: ${NEGATIVE_LINEAR}; box-shadow: 0 0 0 1px rgba(0,0,0,.25), 0 0 8px #e8604a; animation: ag-led 2.4s ease-in-out infinite; }
  @keyframes ag-led { 50% { opacity: .45; } }
  .ag-log { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; display: flex; flex-direction: column; gap: 10px; padding: 18px; }
  .ag-log::-webkit-scrollbar { display: none; }
  .ag-line { display: none; }
  .ag-line.is-on { display: flex; animation: ag-in .45s cubic-bezier(.16,1,.3,1) both; }
  @keyframes ag-in { from { opacity: 0; transform: translateY(10px); } }
  .ag-line p { margin: 0; max-width: 86%; padding: 12px 15px; border-radius: 18px; font-size: clamp(15px, 1.2vw, 17px); line-height: 1.42; }
  .ag-line.is-you { justify-content: flex-end; }
  .ag-line.is-you p { background: ${NEGATIVE_LINEAR}; color: #0a0a0a; border-bottom-right-radius: 5px; font-weight: 500; }
  .ag-line.is-ai p { background: rgba(255,255,255,.09); color: #fff; border-bottom-left-radius: 5px; }
  .ag-tool { display: inline-flex; align-items: center; gap: 10px; max-width: 100%; padding: 7px 10px; border-radius: 6px; background: linear-gradient(180deg, #e4e3df, #cfcec9); border: 1px solid #8f8e89; color: #111; font-family: var(--mono); font-size: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,.85); }
  .ag-tool code { padding: 2px 6px; border-radius: 3px; background: #1a1a1a; color: #e4e3df; font-weight: 700; font-size: 11.5px; }
  .ag-tool em { font-style: normal; color: #3a3935; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ag-tool i { font-style: normal; font-weight: 700; color: #b8503c; }
  .ag-typing { display: flex; gap: 5px; padding: 12px 15px; align-self: flex-start; border-radius: 18px; background: rgba(255,255,255,.06); }
  .ag-typing i { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.6); animation: ag-dot 1s ease-in-out infinite; }
  .ag-typing i:nth-child(2) { animation-delay: .15s; }
  .ag-typing i:nth-child(3) { animation-delay: .3s; }
  @keyframes ag-dot { 50% { transform: translateY(-4px); opacity: .4; } }
  .ag-input { flex: none; display: flex; align-items: center; justify-content: space-between; margin: 0 12px 12px; padding: 10px 10px 10px 16px; border-radius: 999px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); font-size: 14px; color: rgba(255,255,255,.4); }
  .ag-input b { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: #fff; color: #0a0a0a; }
  .ag-page { display: grid; grid-template-columns: 96px minmax(0, 1fr); width: min(100%, 360px); margin-top: clamp(24px, 3.4vh, 40px); border-radius: 16px; overflow: hidden; background: #161616; border: 1px solid rgba(255,255,255,.14); box-shadow: 0 30px 70px rgba(0,0,0,.6); opacity: 0; transform: translateY(20px) rotate(-2deg); transition: opacity .6s ease, transform .8s cubic-bezier(.16,1,.3,1); }
  .ag-page.is-on { opacity: 1; transform: rotate(-2deg); }
  .ag-cover { display: flex; align-items: flex-end; padding: 10px; background: ${NEGATIVE_GRADIENT}; }
  .ag-cover span { font-size: 15px; font-weight: 700; letter-spacing: -0.04em; line-height: .95; color: #0a0a0a; }
  .ag-page-body { display: grid; gap: 5px; padding: 12px 14px; }
  .ag-page-body em { justify-self: start; padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,.25); font-family: var(--mono); font-size: 10px; font-weight: 700; font-style: normal; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.6); transition: all .3s ease; }
  .ag-page-body em.is-live { border-color: #e8604a; background: ${NEGATIVE_LINEAR}; color: #0a0a0a; }
  .ag-page-body b { font-size: 15px; letter-spacing: -0.03em; }
  .ag-page-body small { font-size: 11.5px; color: rgba(255,255,255,.6); }
  .ag-meter { height: 5px; margin-top: 2px; border-radius: 5px; background: rgba(255,255,255,.12); overflow: hidden; }
  .ag-meter i { display: block; height: 100%; background: ${NEGATIVE_LINEAR}; transition: width 1.2s cubic-bezier(.16,1,.3,1); }
  .ag-count { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .ag-progress { position: absolute; left: 0; right: 0; bottom: -18px; height: 2px; background: rgba(255,255,255,.1); }
  .ag-progress i { display: block; height: 100%; background: ${NEGATIVE_LINEAR}; }
  @media (max-width: 899px) {
    .ag { height: 240vh; }
    .ag-pin { grid-template-columns: 1fr; align-content: start; gap: 18px; padding-top: 84px; }
    .ag-stage { height: auto; min-height: 0; }
    .ag-win { width: 100%; height: min(52svh, 460px); }
    .ag-page { display: none; }
  }
  @media (prefers-reduced-motion: reduce) { .ag-line.is-on, .ag-led, .ag-typing i { animation: none; } .ag-page { transition: none; } }
`;
