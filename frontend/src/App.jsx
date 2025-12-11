import { Routes, Route } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { HomePage } from "./pages/HomePage";
import { CreateEventPage } from "./pages/CreateEventPage";
import { EventPage } from "./pages/EventPage";
import { ManageEventPage } from "./pages/ManageEventPage";
import { EventGuestsPage } from "./pages/EventGuestsPage";
import { ProtectedLayout } from "./components/ProtectedLayout";

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/e/:slug" element={<EventPage />} />

      {/* "Protected" app area */}
      <Route element={<ProtectedLayout />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/create" element={<CreateEventPage />} />
        <Route path="/app/events/:id/manage" element={<ManageEventPage />} />
        <Route path="/app/events/:id/guests" element={<EventGuestsPage />} />
      </Route>
    </Routes>
  );
}

export default App;
