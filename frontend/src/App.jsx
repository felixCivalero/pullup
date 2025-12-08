import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import { useEffect, useState } from "react";

function App() {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // For now, hardcode a slug
    const slug = "pullup-launch-party";

    fetch(`http://localhost:3001/events/${slug}`)
      .then((res) => res.json())
      .then((data) => {
        setEvent(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching event:", err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ color: "white" }}>Loading event…</div>;

  if (!event) return <div style={{ color: "white" }}>No event found.</div>;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#05040A",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          background: "linear-gradient(145deg, #25132F, #421B4F)",
          padding: "32px",
          borderRadius: "24px",
          maxWidth: "420px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{ fontSize: "12px", textTransform: "uppercase", opacity: 0.7 }}
        >
          PullUp · Preview
        </div>
        <h1 style={{ fontSize: "28px", margin: "12px 0 4px" }}>
          {event.title}
        </h1>
        <p style={{ fontSize: "14px", opacity: 0.8 }}>{event.description}</p>

        <div style={{ marginTop: "20px", fontSize: "14px", opacity: 0.9 }}>
          <div>📍 {event.location}</div>
          <div style={{ marginTop: "4px" }}>
            🕒 {new Date(event.startsAt).toLocaleString()}
          </div>
        </div>

        <button
          style={{
            marginTop: "24px",
            width: "100%",
            padding: "12px 16px",
            borderRadius: "999px",
            border: "none",
            fontWeight: 600,
            fontSize: "15px",
            cursor: "pointer",
          }}
          onClick={() => alert("In v1 this will be RSVP / Get Ticket")}
        >
          Pull up
        </button>
      </div>
    </div>
  );
}

export default App;
