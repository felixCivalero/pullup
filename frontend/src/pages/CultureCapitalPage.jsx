import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../lib/env.js";
import { initTracking, track, trackPageView } from "../lib/track.js";
import { requestMeta } from "../components/agency/request.js";
import { CULTURE_META } from "./homeMeta.js";
import { DustField } from "./cultureCapital/DustField.js";

/* /culture-capital — Culture Capital I, a SEK 75M fund page in the shape of
   a venture fund's, for culture and love. For people who made their money in
   tech and miss something in the city: ten culture builders, backed with
   capital, led weekly, reaching everyone else. Sells the idea only: no
   specific experiences or line items. Not in the menu,
   not indexed (homeMeta + vite pages plugin): Felix sends the link himself.
   One dust field behind the whole page takes a new shape for each scene
   (data-scene on the section); the text carries the meaning on its own, so
   the page reads the same without the motion. The end is a direct line to
   Felix: the form lands as an agency request (mail + sales sheet). */

const CONTACT = "felix@pullup.se";

function Mark({ children }) {
  return <mark className="cc-mark">{children}</mark>;
}

const RINGS = [
  { name: "Capital", line: "The base. Time, safety and the freedom to go all in." },
  { name: "Partnership", line: "A small team, full time. Judgment and direction." },
  { name: "The ten", line: "Every week, in the room. Alignment, direction and nitro." },
  { name: "The city", line: "Everyone the ten reach. Tens of thousands of people." },
];

// Why ten: the 3.5% line (Chenoweth) for a city of about a million.
const SUM = [
  { n: "10", l: "culture builders" },
  { n: "× 3,500", l: "people each, in their rooms and circles" },
  { n: "35,000", l: "people moving together" },
  { n: "3.5%", l: "of Stockholm" },
];

// The fund in a VC's terms. SEK 75M ≈ three years of ten salaries
// (~40k/month), a partnership of three (~50k/month) and experience budgets,
// which take the largest share. Kept general on purpose: no line items.
const TERMS = [
  { k: "Fund size", v: "SEK 75M" },
  { k: "Term", v: "3 years" },
  { k: "Cohort", v: "10 people" },
  { k: "Home", v: "Stockholm" },
];
const USES = [
  { name: "People", line: "Salaries, so the ten can live for the culture and not for the next rent." },
  { name: "Experiences", line: "Budgets big enough to change how a city feels. The largest share of the fund." },
  { name: "Partnership", line: "A small team, full time, every week in the room. Next to no overhead." },
];

export function CultureCapitalPage() {
  const canvasRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    initTracking();
    trackPageView("culture-capital");
    document.title = CULTURE_META.title;
    const prevBg = document.body.style.background;
    document.body.style.background = "#07060a";
    if (!document.querySelector("link[data-cc-font]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap";
      link.setAttribute("data-cc-font", "");
      document.head.appendChild(link);
    }
    const field = new DustField(canvasRef.current);
    const sections = [...rootRef.current.querySelectorAll("[data-scene]")];
    const seen = new Set();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          field.setScene(e.target.dataset.scene);
          const key = e.target.dataset.track;
          if (key && !seen.has(key)) {
            seen.add(key);
            track("culture_capital_scene", { scene: key });
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => {
      io.disconnect();
      field.destroy();
      document.body.style.background = prevBg;
    };
  }, []);

  return (
    <div className="cc" ref={rootRef}>
      <style>{CSS}</style>
      <canvas className="cc-canvas" ref={canvasRef} aria-hidden="true" />

      <header className="cc-top">
        <span>Culture Capital I</span>
        <span>Stockholm</span>
      </header>

      <section className="cc-hero" data-scene="fund" data-track="hero">
        <div className="cc-hero-foot">
          <p className="cc-kicker">Our first fund · Now forming</p>
          <h1 className="cc-hero-title">Culture Capital I</h1>
          <p className="cc-hero-line">A SEK 75M fund to find and back the people who move a city.<br />Built on culture. Built on love.</p>
          <span className="cc-scroll">Scroll</span>
        </div>
      </section>

      <section className="cc-beat" data-scene="drift" data-track="thesis">
        <p className="cc-big">Stockholm learned to build companies.</p>
        <p className="cc-small">More unicorns per person than almost anywhere on earth. Funds, mentors, networks, a whole machine for growing the next one.</p>
      </section>

      <section className="cc-beat" data-scene="drift">
        <p className="cc-big">Now it has to build what <Mark>companies can’t.</Mark></p>
      </section>

      <section className="cc-beat" data-scene="boil" data-track="ai">
        <p className="cc-big">In a world AI can predict, the one thing left is what people <Mark>feel.</Mark></p>
        <p className="cc-small">Machines can make the expected, endlessly. They can’t make the thing you didn’t know you were missing. A genuine human expression, carrying a soul, is becoming the scarcest thing there is.</p>
      </section>

      <section className="cc-beat" data-scene="boil" data-track="threshold">
        <p className="cc-mid">The algorithm lowered the first door. Anyone can be seen now.</p>
        <p className="cc-mid">The second door is to be <em>felt</em>, by more than your inner circle. That is where culture is made, and almost nobody helps people through it.</p>
      </section>

      <section className="cc-beat" data-scene="boil" data-track="dark">
        <p className="cc-big">Love is not soft.</p>
        <p className="cc-small">It lives in the dark that boils under the culture. In the people who dare to go past the norms and wake feelings you didn’t know you carried. Everything that ever moved the world started there. First felt in the dark, then everywhere.</p>
      </section>

      <section className="cc-beat" data-scene="ten-points" data-track="ten">
        <p className="cc-kicker">What we back</p>
        <p className="cc-big">We don’t back careers. We back the people who <Mark>move a city.</Mark></p>
        <p className="cc-small">Organisers who hold the rooms where things happen. Thinkers who set the direction. Artists who dare to go under the surface. Chosen for their heart, not their genre: people who want something bigger than themselves.</p>
        <p className="cc-note">Ten people per fund.</p>
      </section>

      <section className="cc-beat" data-scene="reach" data-track="why-ten">
        <p className="cc-kicker">Why ten</p>
        <ol className="cc-sum">
          {SUM.map((s) => (
            <li key={s.n}>
              <span className="cc-sum-n">{s.n}</span>
              <span className="cc-sum-l">{s.l}</span>
            </li>
          ))}
        </ol>
        <p className="cc-big">3.5% is enough to <Mark>move a whole city.</Mark></p>
        <p className="cc-small">Political scientist Erica Chenoweth studied a century of movements and found that once 3.5% of a population takes part, change has almost always followed. You don’t need everyone. You need enough. Stockholm has about a million people. Ten culture builders, each moving a few thousand, reach that line.</p>
      </section>

      <section className="cc-rings" data-scene="rings" data-track="rings">
        <div className="cc-rings-text">
          <p className="cc-kicker">How we work</p>
          <p className="cc-mid">One centre. Four rings. Each one reaches further than the last.</p>
          <ol className="cc-ring-list">
            {RINGS.map((r, i) => (
              <li key={r.name}>
                <span className="cc-ring-n">0{i + 1}</span>
                <span>
                  <strong>{r.name}</strong>
                  {r.line}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="cc-beat" data-scene="drift" data-track="fund">
        <p className="cc-kicker">The fund</p>
        <dl className="cc-terms">
          {TERMS.map((t) => (
            <div key={t.k}>
              <dt>{t.k}</dt>
              <dd>{t.v}</dd>
            </div>
          ))}
        </dl>
        <ul className="cc-uses">
          {USES.map((u) => (
            <li key={u.name}>
              <strong>{u.name}</strong>
              {u.line}
            </li>
          ))}
        </ul>
      </section>

      <section className="cc-beat" data-scene="split" data-track="capital">
        <p className="cc-kicker">Two kinds of capital</p>
        <div className="cc-two">
          <div>
            <h2>Give.</h2>
            <p>A ground to stand on, so the ten can live for the culture. Patronage, done properly.</p>
          </div>
          <div>
            <h2>Invest.</h2>
            <p>A share in what breaks through. Venture backs people before there is a company. We back people before there is a movement.</p>
          </div>
        </div>
        <p className="cc-mid cc-center">The giver gets meaning. The investor gets upside. <Mark>The culture gets both.</Mark></p>
      </section>

      <section className="cc-beat" data-scene="boil" data-track="experiences">
        <p className="cc-kicker">Experiences</p>
        <p className="cc-big">Moments big enough to change how a city <Mark>feels.</Mark></p>
        <p className="cc-small">The ten find the hidden patterns that hold a city back. The fund gives them the budget to break them, at a scale culture rarely gets. Not content. Moments people talk about for ten years.</p>
      </section>

      <section className="cc-beat" data-scene="city" data-track="city">
        <p className="cc-kicker">Stockholm</p>
        <p className="cc-big">A city is remembered for its culture, not its unicorns.</p>
        <p className="cc-small">Talent moves to where life feels alive. Stockholm’s biggest tech story was built on music other people made. This is the money going home, and the start of a city other cities look to.</p>
      </section>

      <section className="cc-beat cc-love" data-scene="love" data-track="love">
        <p className="cc-small cc-quote">Somewhere there is someone with a great deal of money who believes the answer is love.</p>
        <p className="cc-mid">This is for them. Build the city you want to live in.</p>
      </section>

      <section className="cc-end" data-scene="ember" data-track="contact">
        <Contact />
      </section>

      <footer className="cc-foot">
        <span>Culture Capital I · Stockholm</span>
        <Link to="/">PullUp</Link>
      </footer>
    </div>
  );
}

function Contact() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", line: "", website: "" });
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError("");
    const description = [
      "Culture Capital I — wants to talk.",
      form.phone.trim() && `Phone: ${form.phone.trim()}`,
      form.line.trim(),
    ].filter(Boolean).join("\n\n");
    try {
      const res = await fetch(`${API_BASE}/agency-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          description,
          website: form.website,
          source: "culture-capital",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
          meta: requestMeta(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(
          {
            invalid_email: "That email doesn’t look right.",
            missing_name: "Tell me your name.",
            rate_limited: "Too many tries. Give it a minute.",
          }[data.error] || `Something went wrong. Write to ${CONTACT} instead.`,
        );
        setState("error");
        track("culture_capital_error", { error: data.error || `http_${res.status}` });
        return;
      }
      setState("done");
      track("culture_capital_sent", {});
    } catch {
      setError(`Couldn’t reach me. Write to ${CONTACT} instead.`);
      setState("error");
    }
  };

  return (
    <div className="cc-contact">
      <figure className="cc-felix">
        <img src="/felix.jpg" alt="Felix Civalero Stolpe" width="640" height="747" loading="lazy" />
      </figure>
      <div className="cc-contact-body">
        <p className="cc-kicker">Culture Capital I opens by conversation only</p>
        <h2 className="cc-big">If this speaks to you, write to me directly.</h2>
        <p className="cc-small">
          I’m Felix Civalero Stolpe. I’ve spent my life seeing what people could become, and what stands in between.
          I’ll answer within 24 hours.
        </p>
        <a className="cc-mail" href={`mailto:${CONTACT}?subject=Culture%20Capital`} onClick={() => track("culture_capital_mail", {})}>
          {CONTACT}
        </a>

        {state === "done" ? (
          <p className="cc-done" role="status">
            Thank you, {form.name.split(" ")[0] || "friend"}. It’s with me now. I’ll be in touch within a day.
          </p>
        ) : (
          <form className="cc-form" onSubmit={submit}>
            <p className="cc-form-head">Or leave your details and I’ll call you.</p>
            <input className="cc-hp" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} aria-hidden="true" />
            <div className="cc-row">
              <input required placeholder="Name" value={form.name} onChange={set("name")} autoComplete="name" aria-label="Name" />
              <input required type="email" placeholder="Email" value={form.email} onChange={set("email")} autoComplete="email" aria-label="Email" />
            </div>
            <input type="tel" placeholder="Phone (if you’d rather I call)" value={form.phone} onChange={set("phone")} autoComplete="tel" aria-label="Phone" />
            <textarea rows={3} placeholder="A line, if you like" value={form.line} onChange={set("line")} aria-label="Message" />
            {error && <p className="cc-error" role="alert">{error}</p>}
            <button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Start the conversation"}</button>
          </form>
        )}
      </div>
    </div>
  );
}

const CSS = `
.cc { position: relative; background: #07060a; color: #f3eee8; min-height: 100vh; overflow-x: clip;
  font-family: "Inter Tight", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; }
.cc-canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block; pointer-events: none; z-index: 0; }
.cc > *:not(.cc-canvas) { position: relative; z-index: 1; }
.cc-sr { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.cc-top { position: fixed !important; top: 0; left: 0; right: 0; z-index: 3 !important; display: flex; justify-content: space-between;
  padding: 22px clamp(20px, 4vw, 48px); font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: rgba(243,238,232,.55);
  mix-blend-mode: difference; }
.cc-big, .cc-mid, .cc-two h2, .cc-quote { font-family: "Instrument Serif", "Iowan Old Style", Georgia, serif; font-weight: 400; }
.cc-big { font-size: clamp(38px, 6.4vw, 92px); line-height: 1.02; letter-spacing: -.015em; margin: 0; max-width: 15ch; }
.cc-mid { font-size: clamp(24px, 3.2vw, 42px); line-height: 1.15; margin: 0 0 .6em; max-width: 24ch; }
.cc-mid em, .cc-big em { font-style: italic; }
.cc-small { font-size: clamp(16px, 1.35vw, 19px); line-height: 1.6; color: rgba(243,238,232,.68); max-width: 46ch; margin: 28px 0 0; }
.cc-kicker { font-size: 11px; letter-spacing: .24em; text-transform: uppercase; color: #ec178f; margin: 0 0 22px; }
.cc-mark { background: #ec178f; color: #fff; padding: 0 .12em; border-radius: 2px; box-decoration-break: clone; -webkit-box-decoration-break: clone;
  box-shadow: 0 0 60px rgba(236,23,143,.45); }
.cc-hero { height: 100vh; min-height: 560px; display: flex; align-items: flex-end; justify-content: center; text-align: center; }
.cc-hero-foot { padding-bottom: 7vh; }
.cc-hero-foot .cc-kicker { color: rgba(243,238,232,.5); }
.cc-hero-line { font-family: "Instrument Serif", Georgia, serif; font-size: clamp(22px, 2.6vw, 34px); line-height: 1.2; margin: 0 0 30px; }
.cc-scroll { font-size: 10px; letter-spacing: .3em; text-transform: uppercase; color: rgba(243,238,232,.35); }
.cc-beat { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 18vh clamp(22px, 9vw, 160px); box-sizing: border-box; }
.cc-beat .cc-mid + .cc-mid { color: rgba(243,238,232,.72); }
.cc-center { text-align: center; max-width: 30ch; margin: 64px auto 0; }
.cc-note { margin-top: 44px; font-size: 11px; letter-spacing: .24em; text-transform: uppercase; color: rgba(243,238,232,.45); }
.cc-rings { min-height: 130vh; display: flex; align-items: center; padding: 18vh clamp(22px, 9vw, 160px); box-sizing: border-box; }
.cc-rings-text { max-width: 440px; }
.cc-ring-list { list-style: none; padding: 0; margin: 36px 0 0; display: grid; gap: 22px; }
.cc-ring-list li { display: grid; grid-template-columns: 34px 1fr; gap: 12px; font-size: 16px; line-height: 1.5; color: rgba(243,238,232,.7); }
.cc-ring-list strong { display: block; color: #f3eee8; font-weight: 500; }
.cc-ring-n { font-size: 11px; letter-spacing: .1em; color: #ec178f; padding-top: 4px; }
.cc-sum { list-style: none; padding: 0; margin: 0 0 56px; display: grid; grid-template-columns: repeat(4, auto); justify-content: start; gap: clamp(18px, 4vw, 64px); }
.cc-sum li { display: grid; gap: 8px; max-width: 16ch; }
.cc-sum-n { font-family: "Instrument Serif", Georgia, serif; font-size: clamp(34px, 4.4vw, 64px); line-height: 1; white-space: nowrap; }
.cc-sum li:last-child .cc-sum-n { color: #ec178f; text-shadow: 0 0 40px rgba(236,23,143,.5); }
.cc-sum-l { font-size: 13px; line-height: 1.45; color: rgba(243,238,232,.6); }
.cc-hero-title { font-family: "Instrument Serif", Georgia, serif; font-weight: 400; font-size: clamp(40px, 5vw, 72px); line-height: 1; margin: 0 0 18px; }
.cc-terms { display: grid; grid-template-columns: repeat(4, 1fr); gap: clamp(18px, 3vw, 48px); margin: 0 0 64px; max-width: 1100px; border-top: 1px solid rgba(243,238,232,.14); }
.cc-terms div { padding-top: 18px; }
.cc-terms dt { font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: rgba(243,238,232,.5); margin-bottom: 12px; }
.cc-terms dd { margin: 0; font-family: "Instrument Serif", Georgia, serif; font-size: clamp(30px, 3.6vw, 52px); line-height: 1; }
.cc-terms div:first-child dd { color: #ec178f; text-shadow: 0 0 40px rgba(236,23,143,.5); }
.cc-uses { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(18px, 3vw, 48px); max-width: 1100px; }
.cc-uses li { font-size: 15px; line-height: 1.55; color: rgba(243,238,232,.65); }
.cc-uses strong { display: block; color: #f3eee8; font-weight: 500; margin-bottom: 6px; }
.cc-two { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(28px, 6vw, 96px); max-width: 980px; }
.cc-two h2 { font-size: clamp(48px, 7vw, 104px); line-height: 1; margin: 0 0 18px; font-style: italic; }
.cc-two p { font-size: 17px; line-height: 1.6; color: rgba(243,238,232,.7); margin: 0; max-width: 38ch; }
.cc-love { justify-content: flex-end; text-align: center; align-items: center; padding-bottom: 12vh; }
.cc-love .cc-mid { margin: 18px auto 0; }
.cc-quote { font-style: italic; font-size: clamp(18px, 1.6vw, 22px); margin: 0 auto; }
.cc-end { min-height: 100vh; display: flex; align-items: center; padding: 14vh clamp(22px, 9vw, 160px); box-sizing: border-box; }
.cc-contact { display: grid; grid-template-columns: minmax(200px, 340px) 1fr; gap: clamp(32px, 6vw, 96px); align-items: center; width: 100%; max-width: 1100px; margin: 0 auto; }
.cc-felix { margin: 0; aspect-ratio: 4/5; overflow: hidden; border-radius: 2px; box-shadow: 0 0 120px rgba(236,23,143,.18); }
.cc-felix img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.08) brightness(.9); display: block; }
.cc-contact .cc-big { font-size: clamp(34px, 4.6vw, 64px); max-width: 16ch; }
.cc-mail { display: inline-block; margin-top: 30px; font-family: "Instrument Serif", Georgia, serif; font-size: clamp(26px, 2.6vw, 36px); color: #f3eee8;
  text-decoration: none; border-bottom: 1px solid #ec178f; padding-bottom: 2px; }
.cc-mail:hover { color: #ec178f; }
.cc-form { margin-top: 40px; display: grid; gap: 10px; max-width: 520px; }
.cc-form-head { margin: 0 0 6px; font-size: 14px; color: rgba(243,238,232,.55); }
.cc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cc-form input, .cc-form textarea { font: inherit; font-size: 15px; color: #f3eee8; background: rgba(255,255,255,.04); border: 1px solid rgba(243,238,232,.16);
  border-radius: 2px; padding: 13px 14px; outline: none; resize: vertical; min-width: 0; }
.cc-form input:focus, .cc-form textarea:focus { border-color: #ec178f; background: rgba(236,23,143,.06); }
.cc-form input::placeholder, .cc-form textarea::placeholder { color: rgba(243,238,232,.38); }
.cc-form button { justify-self: start; margin-top: 8px; font: inherit; font-size: 14px; letter-spacing: .04em; color: #fff; background: #ec178f; border: 0;
  border-radius: 2px; padding: 15px 26px; cursor: pointer; box-shadow: 0 0 50px rgba(236,23,143,.35); }
.cc-form button:disabled { opacity: .6; cursor: default; }
.cc-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.cc-error { color: #ff7ab8; font-size: 14px; margin: 0; }
.cc-done { margin-top: 40px; font-family: "Instrument Serif", Georgia, serif; font-size: 26px; line-height: 1.3; max-width: 26ch; }
.cc-foot { display: flex; justify-content: space-between; padding: 28px clamp(20px, 4vw, 48px); font-size: 11px; letter-spacing: .2em;
  text-transform: uppercase; color: rgba(243,238,232,.4); border-top: 1px solid rgba(243,238,232,.08); }
.cc-foot a { color: inherit; text-decoration: none; }
.cc-foot a:hover { color: #f3eee8; }
@media (max-width: 760px) {
  .cc-beat, .cc-rings, .cc-end { padding-left: 22px; padding-right: 22px; }
  .cc-rings { align-items: flex-end; }
  .cc-rings-text { background: linear-gradient(180deg, rgba(7,6,10,0), rgba(7,6,10,.85) 18%); padding-top: 40px; }
  .cc-two, .cc-contact, .cc-row { grid-template-columns: 1fr; }
  .cc-felix { max-width: 220px; }
  .cc-two { margin-top: 18vh; }
  .cc-terms, .cc-uses { grid-template-columns: 1fr 1fr; }
  .cc-sum { grid-template-columns: 1fr 1fr; row-gap: 28px; }
  .cc-beat[data-scene="ten-points"] { padding-top: 30vh; }
}
`;
