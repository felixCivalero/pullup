// Build time only (vite.config.js, pagesPlugin): the public pages as HTML, so
// search engines and AI crawlers that don't run JavaScript read the real
// content. The very same <App /> the browser runs, so main.jsx can hydrate it
// instead of drawing it again.
import { StrictMode } from "react";
import { prerender } from "react-dom/static";
import { StaticRouter } from "react-router-dom";
import App from "./App.jsx";

export async function render(url) {
  const { prelude } = await prerender(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
  return new Response(prelude).text();
}
