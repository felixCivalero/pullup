import { lazy, Suspense } from "react";
import { Navigate, useParams } from "react-router-dom";
import { StoryPage } from "../../components/agency/story/StoryKit.jsx";

/* /work/:slug — every case is a scroll-told StoryPage; each story's data
   (and its figures) loads on its own. Unknown slugs go back to the stories. */
const LOADERS = {
  "li-karlsen": () => import("./data/li-karlsen.jsx"),
  bkm: () => import("./data/bkm.jsx"),
  kaijas: () => import("./data/kaijas.jsx"),
  stiga: () => import("./data/stiga.jsx"),
  "way-out-west": () => import("./data/way-out-west.jsx"),
  "adam-flambo": () => import("./data/adam-flambo.jsx"),
};

const PAGES = Object.fromEntries(
  Object.entries(LOADERS).map(([slug, load]) => [
    slug,
    lazy(() => load().then((m) => ({ default: () => <StoryPage story={m.default} /> }))),
  ]),
);

export default function StoryRoute() {
  const { slug } = useParams();
  const Page = PAGES[slug];
  if (!Page) return <Navigate to="/#stories" replace />;
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", background: "#000" }} />}>
      <Page key={slug} />
    </Suspense>
  );
}
