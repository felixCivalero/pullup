import { Routes, Route, Navigate } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { NewsletterPage } from "./pages/NewsletterPage";
import { HomePage } from "./pages/HomePage";
import { CrmPage } from "./pages/CrmPage";
import { UnsubscribePage } from "./pages/UnsubscribePage";
import { MediaUploadPage } from "./pages/MediaUploadPage";
import { CreateEventPage } from "./pages/CreateEventPage";
import { EventPage } from "./pages/EventPage";
import { RsvpSuccessPage } from "./pages/RsvpSuccessPage";
import { EventSuccessPage } from "./pages/EventSuccessPage";
import { EventGuestsPage } from "./pages/EventGuestsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminPage } from "./pages/AdminPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { IdeasPage } from "./pages/IdeasPage";
import { AdminEventsPage } from "./pages/AdminEventsPage";
import { AdminCrmPage } from "./pages/AdminCrmPage";
import { AdminEmailPage } from "./pages/AdminEmailPage";
import { AdminPresentationPage } from "./pages/AdminPresentationPage";
import { EventAnalyticsPage } from "./pages/EventAnalyticsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { CookiesPage } from "./pages/CookiesPage";
import { HostAnalyticsPage } from "./pages/HostAnalyticsPage";
import { OAuthAuthorizePage } from "./pages/OAuthAuthorizePage";
import { ProtectedLayout } from "./components/ProtectedLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { IdeaWidget } from "./components/IdeaWidget";
import { HostResourceProvider } from "./contexts/HostResourceContext";

function App() {
  return (
    <ErrorBoundary>
      <HostResourceProvider>
      {/* The floating bottom-right slot. Shows "Have an idea?" by default,    */}
      {/* swaps to the gold "PullUp" coach affordance when the current host    */}
      {/* page has recent chat activity (see HostResourceContext + the         */}
      {/* useRecentChatActivity gate inside IdeaWidget).                       */}
      <IdeaWidget />
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/start" element={<OnboardingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/newsletter" element={<NewsletterPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/cookies" element={<CookiesPage />} />
        <Route path="/u/:token" element={<UnsubscribePage />} />
        <Route path="/upload/:token" element={<MediaUploadPage />} />
        <Route path="/oauth/authorize" element={<OAuthAuthorizePage />} />
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
          {/* Create — auth is deferred to publish time */}
          <Route path="/create" element={<CreateEventPage key="create" />} />
          {/* Events / CRM dashboard */}
          <Route path="/events" element={<HomePage />} />
          <Route path="/analytics" element={<HostAnalyticsPage />} />
          <Route path="/crm" element={<CrmPage />} />
          <Route path="/crm/compose" element={<Navigate to="/crm" replace />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/discover" element={<DiscoverPage />} />
          <Route path="/admin/analytics" element={<AnalyticsPage />} />
          {/* /admin/sales was folded into /admin/crm — keep the URL as a
              redirect so old bookmarks and admin links still work. */}
          <Route path="/admin/sales" element={<Navigate to="/admin/crm" replace />} />
          <Route path="/admin/ideas" element={<IdeasPage />} />
          <Route path="/admin/events" element={<AdminEventsPage />} />
          <Route path="/admin/crm" element={<AdminCrmPage />} />
          <Route path="/admin/email" element={<AdminEmailPage />} />
          <Route path="/admin/presentation" element={<AdminPresentationPage />} />
          {/* Backwards-compat: /home currently points to events */}
          <Route path="/home" element={<HomePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/app/events/:id/edit" element={<CreateEventPage key="edit" />} />
          <Route path="/events/:slug/success" element={<EventSuccessPage />} />
          <Route
            path="/app/events/:id/manage"
            element={<Navigate to="../guests" replace />}
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
      </HostResourceProvider>
    </ErrorBoundary>
  );
}

export default App;
