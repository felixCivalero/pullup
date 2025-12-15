import { Routes, Route } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { HomePage } from "./pages/HomePage";
import { CreateEventPage } from "./pages/CreateEventPage";
import { PostEventPage } from "./pages/PostEventPage";
import { EventPage } from "./pages/EventPage";
import { RsvpSuccessPage } from "./pages/RsvpSuccessPage";
import { EventSuccessPage } from "./pages/EventSuccessPage";
import { ManageEventPage } from "./pages/ManageEventPage";
import { EventGuestsPage } from "./pages/EventGuestsPage";
import { ProtectedLayout } from "./components/ProtectedLayout";
import ErrorBoundary from "./components/ErrorBoundary";

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
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
          <Route path="/home" element={<HomePage />} />
          <Route path="/post" element={<PostEventPage />} />
          <Route path="/create" element={<CreateEventPage />} />
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
