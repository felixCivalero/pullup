import { Routes, Route } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { NewsletterPage } from "./pages/NewsletterPage";
import { HomePage } from "./pages/HomePage";
import { CrmPage } from "./pages/CrmPage";
import { CreateEventPage } from "./pages/CreateEventPage";
import { EventPage } from "./pages/EventPage";
import { RsvpSuccessPage } from "./pages/RsvpSuccessPage";
import { EventSuccessPage } from "./pages/EventSuccessPage";
import { ManageEventPage } from "./pages/ManageEventPage";
import { EventGuestsPage } from "./pages/EventGuestsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminPage } from "./pages/AdminPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { SalesPage } from "./pages/SalesPage";
import { EventAnalyticsPage } from "./pages/EventAnalyticsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { CookiesPage } from "./pages/CookiesPage";
import { HostAnalyticsPage } from "./pages/HostAnalyticsPage";
import { ProtectedLayout } from "./components/ProtectedLayout";
import ErrorBoundary from "./components/ErrorBoundary";

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/newsletter" element={<NewsletterPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/cookies" element={<CookiesPage />} />
        <Route
          path="/e/:slug"
          element={
            <ErrorBoundary>
              <EventPage />
            </ErrorBoundary>
          }
        />
        <Route
          path="/e/:slug/success"
          element={
            <ErrorBoundary>
              <RsvpSuccessPage />
            </ErrorBoundary>
          }
        />

        {/* "Protected" app area */}
        <Route element={<ProtectedLayout />}>
          {/* Events / CRM dashboard */}
          <Route path="/events" element={<HomePage />} />
          <Route path="/analytics" element={<HostAnalyticsPage />} />
          <Route path="/crm" element={<CrmPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/discover" element={<DiscoverPage />} />
          <Route path="/admin/analytics" element={<AnalyticsPage />} />
          <Route path="/admin/sales" element={<SalesPage />} />
          {/* Backwards-compat: /home currently points to events */}
          <Route path="/home" element={<HomePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/create" element={<CreateEventPage key="create" />} />
          <Route path="/app/events/:id/edit" element={<CreateEventPage key="edit" />} />
          <Route path="/events/:slug/success" element={<EventSuccessPage />} />
          <Route
            path="/app/events/:id/manage"
            element={
              <ErrorBoundary>
                <ManageEventPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/app/events/:id/manage/edit"
            element={<CreateEventPage />}
          />
          <Route
            path="/app/events/:id/analytics"
            element={
              <ErrorBoundary>
                <EventAnalyticsPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/app/events/:id/guests"
            element={
              <ErrorBoundary>
                <EventGuestsPage />
              </ErrorBoundary>
            }
          />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
