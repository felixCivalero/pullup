import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { API_BASE } from "../../lib/env.js";
import { trackEvent } from "../../lib/analytics.js";
import { CONTACT } from "./agencyData.js";
import { requestMeta } from "./request.js";
import { Reveal } from "./Reveal.jsx";
import { useT } from "./i18n.js";

/* The booklet, by email only: leave an address → POST /deck-downloads mints a
   personal link and emails it. It is not readable on the site and the PDF is
   never public (backend/assets, streamed via /deck/:token). */
export function DeckTeaser({ source = "landing" }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/deck-downloads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, deck: t.lang === "sv" ? "production-core-sv" : "production-core", source: `booklet_${source}`, meta: requestMeta() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(
          {
            invalid_email: t("That email doesn't look right."),
            rate_limited: t("Too many tries — give it a minute."),
          }[data.error] || t("Something went wrong. Try again, or email {email}.", { email: CONTACT }),
        );
        setState("error");
        return;
      }
      trackEvent("deck_requested", { source });
      setState("done");
    } catch {
      setError(t("Couldn't reach us. Check your connection and try again."));
      setState("error");
    }
  };

  return (
    <section id="deck" className="pc-section pc-rule pc-deck" data-pc-section="deck" data-pc-order="85">
      <div className="pc-wrap pc-deck-in">
        <div className="pc-deck-copy">
          <p className="pc-label">{t("The booklet · by email")}</p>
          <Reveal>
            <h2 className="pc-h2">{t("Where do we want to go — and who do we need to be to get there?")}</h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="pc-deck-lede">
              {t("Getting there isn't a plan you finish — it's a decision you take every day: who we are. A brand is held by many people, so that decision has to be taken together. The booklet shows how one system aligns them, from a founder to a global brand.")}
            </p>
          </Reveal>
          {state === "done" ? (
            <p className="pc-deck-done" role="status">
              <Check size={18} strokeWidth={2.25} />
              {t("On its way — check {email} for your copy.", { email })}
            </p>
          ) : (
            <form className="pc-deck-form" onSubmit={submit} noValidate>
              <label className="pc-deck-field">
                <span className="pc-sr">{t("Email")}</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder={t("Your email")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button type="submit" className="pc-btn pc-btn-dark" disabled={state === "sending"}>
                {state === "sending" ? t("Sending…") : t("Email me the booklet")}
                <ArrowRight size={18} strokeWidth={1.75} />
              </button>
              {state === "error" && <p className="pc-deck-err" role="alert">{error}</p>}
            </form>
          )}
          <p className="pc-deck-fine">{t("One email with your copy. No lists, no spam.")}</p>
        </div>

        <div className="pc-deck-stack" aria-hidden="true">
          <img src={`/deck-preview/${t.lang === "sv" ? "sv/" : ""}system.webp`} alt="" className="pc-deck-slide s3" loading="lazy" decoding="async" />
          <img src={`/deck-preview/${t.lang === "sv" ? "sv/" : ""}who.webp`} alt="" className="pc-deck-slide s2" loading="lazy" decoding="async" />
          <img src={`/deck-preview/${t.lang === "sv" ? "sv/" : ""}cover.webp`} alt="" className="pc-deck-slide s1" loading="lazy" decoding="async" />
        </div>
      </div>
    </section>
  );
}
