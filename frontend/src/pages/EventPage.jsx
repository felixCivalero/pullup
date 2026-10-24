import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../lib/env.js";
import { EventPreview } from "../components/event/EventPreview.jsx";
import { DesktopEventLayout } from "../components/event/DesktopEventLayout.jsx";
import { SignupForm } from "../components/event/SignupForm.jsx";
import { DESKTOP_MIN_WIDTH, pageProps } from "../components/event/pageProps.js";

/* /e/:slug — an event as its host designed it in the editor (cover media,
   content blocks, sign-up), on the old app's page components: full-screen
   on phones, a one-pager from 1024 px. Sign-up, confirmation mail and
   add-to-calendar come from routes/events.js. Crawlers get share previews
   from the backend's /e/:slug. */
export function EventPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.innerWidth >= DESKTOP_MIN_WIDTH);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= DESKTOP_MIN_WIDTH);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/events/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => alive && setData(d))
      .catch(() => alive && setMissing(true));
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    if (!data) return undefined;
    const prev = document.title;
    document.title = data.event.title;
    return () => { document.title = prev; };
  }, [data]);

  if (missing) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#05040a", color: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", padding: 24, textAlign: "center" }}>
        <div><h1 style={{ margin: "0 0 8px", fontSize: 24 }}>Eventet finns inte</h1><p style={{ margin: 0, opacity: 0.6 }}>Länken kan vara fel, eller så har eventet tagits bort.</p></div>
      </main>
    );
  }
  if (!data) return <div style={{ minHeight: "100dvh", background: "#05040a" }} />;

  const ev = data.event;
  const rsvpContent = () => (
    <SignupForm slug={ev.slug} open={ev.open} full={ev.full} calendar={data.calendar} cta={ev.signupSettings?.cta || null} />
  );
  const props = pageProps(ev, { rsvpContent });

  return (
    <>
      <style>{`
        body, html { overflow: hidden; height: 100dvh; width: 100%; margin: 0; background: #05040a; }
        * { box-sizing: border-box; }
      `}</style>
      <div style={{ width: "100%", height: "100dvh", overflow: "hidden", background: "#05040a", color: "#fff" }}>
        {isDesktop ? <DesktopEventLayout {...props} /> : <EventPreview {...props} />}
      </div>
    </>
  );
}
