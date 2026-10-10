import { useState } from "react";
import { ArrowDown, Check } from "lucide-react";
import { API_BASE } from "../../lib/env.js";
import { trackEvent } from "../../lib/analytics.js";
import { Reveal } from "./Reveal.jsx";

/* The deck as a lead magnet: email in → personal token → the PDF downloads
   right here and the same link lands in their inbox (backend: deckDownloads).
   Optional name/company stay collapsed so the ask is one field. */
export function DeckGate({ source = "landing" }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [error, setError] = useState("");
  const [token, setToken] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/deck-downloads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, company, source, deck: "production-core" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        setError(
          data.error === "invalid_email"
            ? "That email doesn't look right."
            : data.error === "rate_limited"
              ? "Too many tries — give it a minute."
              : "Something went wrong. Try again, or email hello@pullup.se.",
        );
        setState("error");
        return;
      }
      trackEvent("deck_download", { source });
      setToken(data.token);
      setState("done");
      window.location.assign(`${API_BASE}/deck/${data.token}`);
    } catch {
      setError("Couldn't reach us. Check your connection and try again.");
      setState("error");
    }
  };

  return (
    <section
      id="deck"
      className="pc-section pc-rule pc-deck"
      data-pc-section="deck"
      data-pc-order="85"
    >
      <div className="pc-wrap pc-deck-in">
        <div className="pc-deck-copy">
          <p className="pc-label">The deck · free</p>
          <Reveal>
            <h2 className="pc-h2">Where do we want to go — and who do we need to be to get there?</h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="pc-deck-lede">
              Getting there isn't a plan you finish — it's a decision you take every day:
              who we are. A brand is held by many people, so that decision has to be taken
              together. The deck shows how one system aligns them, from a founder to a global brand.
            </p>
          </Reveal>

          {state === "done" ? (
            <div className="pc-deck-done" role="status">
              <Check size={20} strokeWidth={2} />
              <div>
                <p><strong>Downloading now.</strong> We've also sent the link to {email}.</p>
                <a href={`${API_BASE}/deck/${token}`}>Download didn't start? Get it here.</a>
              </div>
            </div>
          ) : (
            <form className="pc-deck-form" onSubmit={submit} noValidate>
              <label className="pc-deck-field">
                <span>Work email</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <div className="pc-deck-row">
                <label className="pc-deck-field">
                  <span>Name <em>optional</em></span>
                  <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="pc-deck-field">
                  <span>Company <em>optional</em></span>
                  <input type="text" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} />
                </label>
              </div>
              <button type="submit" className="pc-btn pc-btn-dark" disabled={state === "sending"}>
                {state === "sending" ? "Preparing your copy…" : "Get the deck"}
                <ArrowDown size={18} strokeWidth={1.75} />
              </button>
              {state === "error" && <p className="pc-deck-error" role="alert">{error}</p>}
              <p className="pc-deck-fine">PDF · 14 slides. We'll email you the link too. No spam, no list-selling.</p>
            </form>
          )}
        </div>

        <Reveal delay={0.1} className="pc-deck-stack">
          <img src="/deck/system.webp" alt="" className="pc-deck-slide s3" loading="lazy" decoding="async" />
          <img src="/deck/who.webp" alt="" className="pc-deck-slide s2" loading="lazy" decoding="async" />
          <img
            src="/deck/cover.webp"
            alt="The Production Core deck — cover slide"
            className="pc-deck-slide s1"
            loading="lazy"
            decoding="async"
          />
        </Reveal>
      </div>
    </section>
  );
}
