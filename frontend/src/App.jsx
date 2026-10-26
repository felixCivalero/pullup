import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense } from "react";
import { lazyPage } from "./lib/lazyPage.js";
import ErrorBoundary from "./components/ErrorBoundary";

/* pullup.se — Felix's site and the PullUp event platform. Public: the front
   page, the case pages, the legal pages, event pages (/e/:slug). /login
   signs anyone in (the first time makes the account). Every organiser has
   /admin/events + /admin/people + /admin/mail (their events, guests, CRM,
   mail) and /admin/agents (their own AI on PullUp; /connect approves one).
   Felix only: /admin (statistics), /admin/stockholm (culture scraper),
   /admin/projects (each client's project: timeline, board, strategy deck),
   /admin/sales (sales pipeline, read from the Google Sheet), /admin/archi.
   Everything else goes to the front page. The old PullUp platform lives on
   the `pullup-app` branch. */
const LandingPage = lazyPage(() => import("./pages/LandingPage"), "LandingPage");
const StoryRoute = lazyPage(() => import("./pages/stories/StoryRoute"));
const PrivacyPage = lazyPage(() => import("./pages/LegalPages"), "PrivacyPage");
const TermsPage = lazyPage(() => import("./pages/LegalPages"), "TermsPage");
const CookiesPage = lazyPage(() => import("./pages/LegalPages"), "CookiesPage");
const LoginPage = lazyPage(() => import("./pages/LoginPage"), "LoginPage");
const StatsPage = lazyPage(() => import("./pages/admin/StatsPage"), "StatsPage");
const StockholmPage = lazyPage(() => import("./pages/admin/StockholmPage"), "StockholmPage");
const ProjectPage = lazyPage(() => import("./pages/admin/ProjectPage"), "ProjectPage");
const SalesPage = lazyPage(() => import("./pages/admin/SalesPage"), "SalesPage");
const EventPage = lazyPage(() => import("./pages/EventPage"), "EventPage");
const EventsPage = lazyPage(() => import("./pages/admin/EventsPage"), "EventsPage");
const EventDetailPage = lazyPage(() => import("./pages/admin/EventDetailPage"), "EventDetailPage");
const PeoplePage = lazyPage(() => import("./pages/admin/PeoplePage"), "PeoplePage");
const MailPage = lazyPage(() => import("./pages/admin/MailPage"), "MailPage");
const EventCreatePage = lazyPage(() => import("./pages/admin/EventEditorPage"), "EventCreatePage");
const EventEditorPage = lazyPage(() => import("./pages/admin/EventEditorPage"), "EventEditorPage");
const ArchiPage = lazyPage(() => import("./pages/admin/ArchiPage"), "ArchiPage");
const AgentsPage = lazyPage(() => import("./pages/admin/AgentsPage"), "AgentsPage");
const ConnectPage = lazyPage(() => import("./pages/ConnectPage"), "ConnectPage");

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/work/:slug" element={<StoryRoute />} />
          {/* The link in outreach mail: lands on the cases, counted as "mejl". */}
          <Route path="/case" element={<Navigate to="/?ref=mejl#stories" replace />} />
          <Route path="/stories/adam-flambo" element={<Navigate to="/work/adam-flambo" replace />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/cookies" element={<CookiesPage />} />
          {/* The event platform: a guest's event page; events + CRM in admin. */}
          <Route path="/e/:slug" element={<EventPage />} />
          <Route path="/login" element={<LoginPage />} />
          {/* An assistant asks to act for you (OAuth consent, backend routes/oauth.js). */}
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/admin" element={<StatsPage />} />
          <Route path="/admin/stockholm" element={<StockholmPage />} />
          <Route path="/admin/projects" element={<ProjectPage />} />
          <Route path="/admin/timeline" element={<Navigate to="/admin/projects" replace />} />
          <Route path="/admin/sales" element={<SalesPage />} />
          <Route path="/admin/clients" element={<Navigate to="/admin/projects" replace />} />
          <Route path="/admin/events" element={<EventsPage />} />
          <Route path="/admin/events/new" element={<EventCreatePage />} />
          <Route path="/admin/events/:id" element={<EventDetailPage />} />
          <Route path="/admin/events/:id/edit" element={<EventEditorPage />} />
          <Route path="/admin/people" element={<PeoplePage />} />
          <Route path="/admin/mail" element={<MailPage />} />
          <Route path="/admin/archi" element={<ArchiPage />} />
          <Route path="/admin/agents" element={<AgentsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
