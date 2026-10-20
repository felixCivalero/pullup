import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense } from "react";
import { lazyPage } from "./lib/lazyPage.js";
import ErrorBoundary from "./components/ErrorBoundary";

/* pullup.se — Felix's site. Public: the front page, the case pages and the
   legal pages. Private: /login (not linked anywhere) → /admin (statistics),
   /admin/stockholm (culture scraper), /admin/timeline (each client's
   content timeline), /admin/sales (sales pipeline, read from the Google
   Sheet), Felix only.
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
const TimelinePage = lazyPage(() => import("./pages/admin/TimelinePage"), "TimelinePage");
const SalesPage = lazyPage(() => import("./pages/admin/SalesPage"), "SalesPage");

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/work/:slug" element={<StoryRoute />} />
          <Route path="/stories/adam-flambo" element={<Navigate to="/work/adam-flambo" replace />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/cookies" element={<CookiesPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<StatsPage />} />
          <Route path="/admin/stockholm" element={<StockholmPage />} />
          <Route path="/admin/timeline" element={<TimelinePage />} />
          <Route path="/admin/sales" element={<SalesPage />} />
          <Route path="/admin/clients" element={<Navigate to="/admin/timeline" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
