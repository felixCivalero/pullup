import { Routes, Route } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { HomePage } from "./pages/HomePage";
import { CreateEventPage } from "./pages/CreateEventPage";
import { EventPage } from "./pages/EventPage";
import { ManageEventPage } from "./pages/ManageEventPage";
import { EventGuestsPage } from "./pages/EventGuestsPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/create" element={<CreateEventPage />} />
      <Route path="/e/:slug" element={<EventPage />} />
      <Route path="/app/events/:id/manage" element={<ManageEventPage />} />
      <Route path="/app/events/:id/guests" element={<EventGuestsPage />} />
    </Routes>
  );
}

export default App;
