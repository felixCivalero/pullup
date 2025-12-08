import { Routes, Route } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { CreateEventPage } from "./pages/CreateEventPage";
import { EventPage } from "./pages/EventPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/create" element={<CreateEventPage />} />
      <Route path="/e/:slug" element={<EventPage />} />
      {/* later: /success, /app/events, etc */}
    </Routes>
  );
}

export default App;
