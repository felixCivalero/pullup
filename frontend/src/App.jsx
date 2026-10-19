import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense } from "react";
import { lazyPage } from "./lib/lazyPage.js";
import ErrorBoundary from "./components/ErrorBoundary";

/* pullup.se — Felix's site. Public: the front page, the case pages and the
   legal pages. Private: /login (not linked anywhere) → /admin, Felix only.
   Everything else goes to the front page. The old PullUp platform lives on
   the `pullup-app` branch. */
const LandingPage = lazyPage(() => import("./pages/LandingPage"), "LandingPage");
const StoryRoute = lazyPage(() => import("./pages/stories/StoryRoute"));
const PrivacyPage = lazyPage(() => import("./pages/LegalPages"), "PrivacyPage");
const TermsPage = lazyPage(() => import("./pages/LegalPages"), "TermsPage");
const CookiesPage = lazyPage(() => import("./pages/LegalPages"), "CookiesPage");
const LoginPage = lazyPage(() => import("./pages/LoginPage"), "LoginPage");
const AdminPage = lazyPage(() => import("./pages/AdminPage"), "AdminPage");

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
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
