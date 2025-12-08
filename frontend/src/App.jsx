import { Routes, Route } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { HomePage } from "./pages/HomePage";
import { CreateEventPage } from "./pages/CreateEventPage";
import { EventPage } from "./pages/EventPage";
import { ManageEventPage } from "./pages/ManageEventPage";
import { EventGuestsPage } from "./pages/EventGuestsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { CrmPage } from "./pages/CrmPage";
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
        <Route path="/app/settings" element={<SettingsPage />} />
        <Route path="/app/integrations" element={<IntegrationsPage />} />
        <Route path="/app/payments" element={<PaymentsPage />} />
        <Route path="/app/crm" element={<CrmPage />} />
      </Route>
    </Routes>
  );
}

export default App;
