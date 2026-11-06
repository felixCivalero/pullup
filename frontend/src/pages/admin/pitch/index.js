/* Every pitch, newest first, each tied to its client: `prospectId` is the
   client's ID in the sales sheet (P-…), the same key Sälj and Projekt use, so
   a client's pitch is one click from their row there (pitchFor). A pitch is
   its own file (pitch/<slug>.jsx, exporting `pitch`) and loads only when
   opened. Pictures go in public/pitch/<slug>/. `project` = the client is Won and
   has a project in Projekt. `share` = the card a shared link shows in
   WhatsApp, Messages and other previews (image: public/og/pitch-<slug>.jpg,
   made with the same photo as the pitch; bump ?v= when it changes). */
export const PITCHES = [
  { slug: "ascaro", prospectId: "P-037", client: "ASCARO", title: "Livsstil på taket", date: "2026-11-10", slides: 13, cover: "/pitch/ascaro/kl.jpg", share: { title: "PullUp × ASCARO", description: "Livsstil på taket. Padel, mat, dryck, träning och kläder.", image: "/og/pitch-ascaro.jpg?v=1" }, load: () => import("./ascaro.jsx") },
  { slug: "lilla-sauna", prospectId: "P-056", client: "Lilla Sauna", title: "Lilla Sauna över hela Sverige", date: "2026-11-06", slides: 18, cover: "/pitch/lilla-sauna/place-abisko.jpg", share: { title: "PullUp × Lilla Sauna", description: "En resa genom Sverige, en bastu i taget.", image: "/og/pitch-lilla-sauna.jpg?v=1" }, load: () => import("./lilla-sauna.jsx") },
  { slug: "rami-huxley", prospectId: "P-666", project: true, client: "Rami Huxley", title: "Habibi punk", date: "2026-11-06", slides: 12, cover: "/pitch/rami-huxley/skyline.jpg", share: { title: "PullUp × Rami Huxley", description: "Habibi punk. To da moon.", image: "/og/pitch-rami-huxley.jpg?v=1" }, load: () => import("./rami-huxley.jsx") },
];

export const pitchFor = (prospectId) => PITCHES.find((p) => p.prospectId === prospectId) || null;
