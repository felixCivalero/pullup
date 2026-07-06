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
// /p/:slug is dual-purpose: a UUID is the LEGACY pull-up shorthand (forward into
// the event Room, preserving QR ?w=&s=); a human slug is a kind='product' page,
// rendered by the same engine as an event. UUID-shape disambiguates the two so
// neither breaks.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function PullupRedirect() {
  const { slug } = useParams();
  const { search } = useLocation();
  if (slug && UUID_RE.test(slug)) {
    return <Navigate to={`/events/${slug}/room${search}`} replace />;
  }
  return (
    <ErrorBoundary>
      <EventPage />
    </ErrorBoundary>
  );
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
  // Session-gated lazy mount: logged-out visitors (the Nairobi guest on a
  // shared event link) never download the dock/admin code at all.
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Suspense fallback={null}>
      <IdeaWidget />
      <ViewAsBar />
    </Suspense>
  );
}
// ── Pages: every route is its own chunk (see lib/lazyPage.js). Eager only:
// AuthCallbackPage (mid-OAuth redirect — a chunk hiccup there loses the login).
import { Suspense } from "react";
import { lazyPage } from "./lib/lazyPage.js";
import { LoadingScreen } from "./components/LoadingScreen.jsx";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
const LandingPage = lazyPage(() => import("./pages/LandingPage"), "LandingPage");
const StartHostingPage = lazyPage(() => import("./pages/StartHostingPage"), "StartHostingPage");
const ForgotPasswordPage = lazyPage(() => import("./pages/ForgotPasswordPage"), "ForgotPasswordPage");
const ResetPasswordPage = lazyPage(() => import("./pages/ResetPasswordPage"), "ResetPasswordPage");
const NewsletterPage = lazyPage(() => import("./pages/NewsletterPage"), "NewsletterPage");
const UnsubscribePage = lazyPage(() => import("./pages/UnsubscribePage"), "UnsubscribePage");
const CreateEventPage = lazyPage(() => import("./pages/CreateEventPage"), "CreateEventPage");
const EventPage = lazyPage(() => import("./pages/EventPage"), "EventPage");
const RsvpSuccessPage = lazyPage(() => import("./pages/RsvpSuccessPage"), "RsvpSuccessPage");
const EventSuccessPage = lazyPage(() => import("./pages/EventSuccessPage"), "EventSuccessPage");
const EventGuestsPage = lazyPage(() => import("./pages/EventGuestsPage"), "EventGuestsPage");
const EventRoomPage = lazyPage(() => import("./pages/EventRoomPage"));
const HostCheckinPage = lazyPage(() => import("./pages/HostCheckinPage"));
const NodeProfilePage = lazyPage(() => import("./pages/NodeProfilePage"));
const SettingsPage = lazyPage(() => import("./pages/SettingsPage"), "SettingsPage");
const AutoDmPage = lazyPage(() => import("./pages/AutoDmPage"), "AutoDmPage");
const AdminPage = lazyPage(() => import("./pages/AdminPage"), "AdminPage");
const DiscoverPage = lazyPage(() => import("./pages/DiscoverPage"), "DiscoverPage");
const AnalyticsPage = lazyPage(() => import("./pages/AnalyticsPage"), "AnalyticsPage");
const IdeasPage = lazyPage(() => import("./pages/IdeasPage"), "IdeasPage");
const AdminEventsPage = lazyPage(() => import("./pages/AdminEventsPage"), "AdminEventsPage");
const AdminCrmPage = lazyPage(() => import("./pages/AdminCrmPage"), "AdminCrmPage");
const AdminInboxPage = lazyPage(() => import("./pages/AdminInboxPage"), "AdminInboxPage");
const AdminMatchesPage = lazyPage(() => import("./pages/AdminMatchesPage"), "AdminMatchesPage");
const AdminPresentationPage = lazyPage(() => import("./pages/AdminPresentationPage"), "AdminPresentationPage");
const EventAnalyticsPage = lazyPage(() => import("./pages/EventAnalyticsPage"), "EventAnalyticsPage");
const PrivacyPage = lazyPage(() => import("./pages/PrivacyPage"), "PrivacyPage");
const TermsPage = lazyPage(() => import("./pages/TermsPage"), "TermsPage");
const CookiesPage = lazyPage(() => import("./pages/CookiesPage"), "CookiesPage");
const HostAnalyticsPage = lazyPage(() => import("./pages/HostAnalyticsPage"), "HostAnalyticsPage");
const OAuthAuthorizePage = lazyPage(() => import("./pages/OAuthAuthorizePage"), "OAuthAuthorizePage");
const MediaUploadPage = lazyPage(() => import("./pages/MediaUploadPage"), "MediaUploadPage");
import { CommunityRedirect } from "./components/CommunityRedirect.jsx";
// The logged-in shell itself is lazy: guests on /e/:slug never download it.
const ProtectedLayout = lazyPage(() => import("./components/ProtectedLayout"), "ProtectedLayout");
const ViewAsBar = lazyPage(() => import("./components/admin/ViewAsBar.jsx"), "ViewAsBar"); // admin lens; admin-gated, hidden for everyone else
const IdeaWidget = lazyPage(() => import("./components/IdeaWidget"), "IdeaWidget");
import ErrorBoundary from "./components/ErrorBoundary";
import { HostResourceProvider } from "./contexts/HostResourceContext";
import { MessagesStoreProvider } from "./contexts/MessagesStoreContext";
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
      {/* The messages store sits ABOVE routes and the dock: contacts load once
          per session, survive every navigation, and stay live over realtime. */}
      <MessagesStoreProvider>
      {/* The PullUp AI coach widget — only mounted on the create/edit-event
          builder (it gets in the way of the Room's chat composer elsewhere). */}
      <CoachWidgetGate />
      {/* One Suspense for all lazy routes — the same loading eyes every
          surface already uses, shown only while a page chunk fetches. */}
      <Suspense fallback={<LoadingScreen label="loading" />}>
      <Routes>
        {/* Public — landing page renders the slide shell. /login and
            /start point at the same component so the URL still works
            (refresh, deep link, back/forward) but the visual is a
            horizontal slide between the hero, login, and onboarding
            panels instead of a hard page swap. */}
        <Route path="/" element={<LandingPage />} />
        {/* /start = the creator onboarding line: account → subscribe → build. */}
        <Route path="/start" element={<StartHostingPage />} />
        <Route path="/waitlist" element={<LandingPage />} />
        <Route path="/login" element={<LandingPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
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
        {/* Public community page — a kind='community' event, rendered by the
            same page engine as an event (dateless, "Join" CTA). */}
        <Route
          path="/c/:slug"
          element={
            <ErrorBoundary>
              <EventPage />
            </ErrorBoundary>
          }
        />
        {/* /p/:slug — product page (kind='product') OR, for a UUID, the legacy
            pull-up shorthand into the event Room. PullupRedirect disambiguates. */}
        <Route path="/p/:slug" element={<PullupRedirect />} />
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
          {/* Content Planner is PAUSED (superseded by The Room). The page +
              backend still exist on disk; the route is pulled so it can't ship
              as a reachable URL. Re-add this line to resume the work. */}
          {/* Host CRM composer / email campaigns were removed — relationships
              live in the Room now, and the platform no longer sends styled mass
              email. Redirect old links so they land on the Room, not a 404. */}
          <Route path="/crm" element={<Navigate to="/room" replace />} />
          <Route path="/crm/compose" element={<Navigate to="/room" replace />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/inbox" element={<AdminInboxPage />} />
          <Route path="/admin/discover" element={<DiscoverPage />} />
          <Route path="/admin/analytics" element={<AnalyticsPage />} />
          {/* /admin/sales was folded into /admin/crm — keep the URL as a
              redirect so old bookmarks and admin links still work. */}
          <Route path="/admin/sales" element={<Navigate to="/admin/crm" replace />} />
          <Route path="/admin/ideas" element={<IdeasPage />} />
          <Route path="/admin/events" element={<AdminEventsPage />} />
          <Route path="/admin/crm" element={<AdminCrmPage />} />
          <Route path="/admin/matches" element={<AdminMatchesPage />} />
          {/* Admin platform newsletter / broadcast was removed with campaigns. */}
          <Route path="/admin/email" element={<Navigate to="/admin/crm" replace />} />
          <Route path="/admin/presentation" element={<AdminPresentationPage />} />
          {/* Backwards-compat: /home used to point at the events dashboard;
              now it lands on the Room like everything else. */}
          <Route path="/home" element={<Navigate to="/room" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Host's single community page → opens in the event editor. */}
          <Route path="/community" element={<CommunityRedirect />} />
          {/* Auto-DM — Instagram comment→DM triggers (per-event, migration 068) */}
          <Route path="/auto-dm" element={<AutoDmPage />} />
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
      </Suspense>
      </MessagesStoreProvider>
      </HostResourceProvider>
    </ErrorBoundary>
  );
}

export default App;
