/* Every pitch, newest first, each tied to its client: `prospectId` is the
   client's ID in the sales sheet (P-…), the same key Sälj and Projekt use, so
   a client's pitch is one click from their row there (pitchFor). A pitch is
   its own file (pitch/<slug>.jsx, exporting `pitch`) and loads only when
   opened. Pictures go in public/pitch/<slug>/. `project` = the client is Won and
   has a project in Projekt. */
export const PITCHES = [
  { slug: "ascaro", prospectId: "P-037", client: "ASCARO", title: "Från taket på NK till världens tak", date: "2026-11-10", slides: 13, cover: "/pitch/ascaro/kl.jpg", load: () => import("./ascaro.jsx") },
  { slug: "lilla-sauna", prospectId: "P-056", client: "Lilla Sauna", title: "Lilla Sauna över hela Sverige", date: "2026-11-06", slides: 18, cover: "/pitch/lilla-sauna/place-abisko.jpg", load: () => import("./lilla-sauna.jsx") },
  { slug: "dawood", prospectId: "P-666", project: true, client: "Adam Dawood", title: "Dawoodski to da moon", date: "2026-11-06", slides: 12, cover: "/pitch/dawood/skyline.jpg", load: () => import("./dawood.jsx") },
];

export const pitchFor = (prospectId) => PITCHES.find((p) => p.prospectId === prospectId) || null;
