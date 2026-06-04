import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";

// /app/events/:id/manage → redirect to the guests subpage. Absolute path built
// from the param: a relative <Navigate to="../guests"> over-pops on these flat
// (non-nested) routes and lands on a bare /guests with no matching route.
function ManageRedirect() {
  const { id } = useParams();
  return <Navigate to={`/app/events/${id}/guests`} replace />;
}

// /p/:eventId retired — the pull-up threshold + persistent guest room collapsed
// into the ONE event Room. Forward (carrying the QR's ?w=&s= params) so live
// scans and any old links land in the canonical room.
function PullupRedirect() {
  const { eventId } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/events/${eventId}/room${search}`} replace />;
}

// The event Room is one public URL for everyone now. Old host-only
// /app/events/:id/room forwards to it.
function AppRoomRedirect() {
  const { id } = useParams();
  return <Navigate to={`/events/${id}/room`} replace />;
}

// The dock is the host's home base across the logged-in app: the pullup chat
// (Messages) by default, the event-building AI (Create) when on a builder
// surface. IdeaWidget self-hides on public/event pages, on mobile, and when
// logged out — so we mount it everywhere and let it decide.
function CoachWidgetGate() {
  return <IdeaWidget />;
}
import { LandingPage } from "./pages/LandingPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { NewsletterPage } from "./pages/NewsletterPage";
import { UnsubscribePage } from "./pages/UnsubscribePage";
import { CreateEventPage } from "./pages/CreateEventPage";
import { EventPage } from "./pages/EventPage";
import { RsvpSuccessPage } from "./pages/RsvpSuccessPage";
import { EventSuccessPage } from "./pages/EventSuccessPage";
import { EventGuestsPage } from "./pages/EventGuestsPage";
import EventRoomPage from "./pages/EventRoomPage";
import HostCheckinPage from "./pages/HostCheckinPage";
import NodeProfilePage from "./pages/NodeProfilePage";
import { ViewAsBar } from "./components/admin/ViewAsBar.jsx";
import { SettingsPage } from "./pages/SettingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminPage } from "./pages/AdminPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { IdeasPage } from "./pages/IdeasPage";
import { AdminEventsPage } from "./pages/AdminEventsPage";
import { AdminCrmPage } from "./pages/AdminCrmPage";
import { AdminPresentationPage } from "./pages/AdminPresentationPage";
import { EventAnalyticsPage } from "./pages/EventAnalyticsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { CookiesPage } from "./pages/CookiesPage";
import { HostAnalyticsPage } from "./pages/HostAnalyticsPage";
import { ContentPlannerPage } from "./pages/ContentPlannerPage";
import { OAuthAuthorizePage } from "./pages/OAuthAuthorizePage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { WhatsappVerifyPage } from "./pages/WhatsappVerifyPage";
import { MediaUploadPage } from "./pages/MediaUploadPage";
import { ProtectedLayout } from "./components/ProtectedLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { IdeaWidget } from "./components/IdeaWidget";
import { HostResourceProvider } from "./contexts/HostResourceContext";
import { useAuth } from "./contexts/AuthContext";

// /room is no longer its own surface — your room is your person room. There is
// exactly ONE room concept, addressed by id: yours is /r/:me. /room (and every
// legacy redirect that points at it) bounces to your own person room.
function RoomRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/r/${user.id}`} replace />;
}

function App() {
  return (
    <ErrorBoundary>
      <HostResourceProvider>
      {/* The PullUp AI coach widget — only mounted on the create/edit-event
          builder (it gets in the way of the Room's chat composer elsewhere). */}
      <CoachWidgetGate />
      <ViewAsBar />
      <Routes>
        {/* Public — landing page renders the slide shell. /login and
            /start point at the same component so the URL still works
            (refresh, deep link, back/forward) but the visual is a
            horizontal slide between the hero, login, and onboarding
            panels instead of a hard page swap. */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/start" element={<LandingPage />} />
        <Route path="/login" element={<LandingPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/whatsapp-verify" element={<WhatsappVerifyPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/newsletter" element={<NewsletterPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/cookies" element={<CookiesPage />} />
        <Route path="/u/:token" element={<UnsubscribePage />} />
        <Route path="/m/:token" element={<MediaUploadPage />} />
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
        {/* /p/:eventId retired → forwards into the one event Room (preserving
            any QR ?w=&s= so scans still pull up). */}
        <Route path="/p/:eventId" element={<PullupRedirect />} />
        {/* A node's profile — the room's public face, viewer-relative. */}
        <Route
          path="/r/:id"
          element={
            <ErrorBoundary>
              <NodeProfilePage />
            </ErrorBoundary>
          }
        />
        {/* "Protected" app area */}
        <Route element={<ProtectedLayout />}>
          {/* Create — auth is deferred to publish time */}
          <Route path="/create" element={<CreateEventPage key="create" />} />
          {/* The Room — the global home of PullUp (person-centric, all events).
              The old events dashboard (/events) is gone; the Room is home now.
              Keep /events and /home as redirects so old links/bookmarks land
              on the Room instead of 404ing. */}
          <Route path="/room" element={<RoomRedirect />} />
          {/* THE event Room — one surface per event for host AND guest, inside
              the shared shell. Role decides the chrome; no session → login modal
              (the shell tolerates anon here and lets the room/modal resolve who
              you are). */}
          <Route
            path="/events/:id/room"
            element={
              <ErrorBoundary>
                <EventRoomPage />
              </ErrorBoundary>
            }
          />
          <Route path="/events" element={<Navigate to="/room" replace />} />
          <Route path="/analytics" element={<HostAnalyticsPage />} />
          <Route path="/planner" element={<ContentPlannerPage />} />
          {/* Host CRM composer / email campaigns were removed — relationships
              live in the Room now, and the platform no longer sends styled mass
              email. Redirect old links so they land on the Room, not a 404. */}
          <Route path="/crm" element={<Navigate to="/room" replace />} />
          <Route path="/crm/compose" element={<Navigate to="/room" replace />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/discover" element={<DiscoverPage />} />
          <Route path="/admin/analytics" element={<AnalyticsPage />} />
          {/* /admin/sales was folded into /admin/crm — keep the URL as a
              redirect so old bookmarks and admin links still work. */}
          <Route path="/admin/sales" element={<Navigate to="/admin/crm" replace />} />
          <Route path="/admin/ideas" element={<IdeasPage />} />
          <Route path="/admin/events" element={<AdminEventsPage />} />
          <Route path="/admin/crm" element={<AdminCrmPage />} />
          {/* Admin platform newsletter / broadcast was removed with campaigns. */}
          <Route path="/admin/email" element={<Navigate to="/admin/crm" replace />} />
          <Route path="/admin/presentation" element={<AdminPresentationPage />} />
          {/* Backwards-compat: /home used to point at the events dashboard;
              now it lands on the Room like everything else. */}
          <Route path="/home" element={<Navigate to="/room" replace />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/app/events/:id/edit" element={<CreateEventPage key="edit" />} />
          <Route path="/events/:slug/success" element={<EventSuccessPage />} />
          <Route
            path="/app/events/:id/manage"
            element={<ManageRedirect />}
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
          {/* The host's live rotating QR — held up at the door for guests to scan. */}
          <Route
            path="/app/events/:id/checkin"
            element={
              <ErrorBoundary>
                <HostCheckinPage />
              </ErrorBoundary>
            }
          />
          {/* Canonical event Room moved to public /events/:id/room. */}
          <Route path="/app/events/:id/room" element={<AppRoomRedirect />} />
        </Route>
      </Routes>
      </HostResourceProvider>
    </ErrorBoundary>
  );
}

export default App;
