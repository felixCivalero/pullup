// What a site-check result says, in words (Statistik: journeys and the list
// of what was typed).
export const checkResult = (r) => (typeof r === "number"
  ? `${r} av 100`
  : { blocked: "stänger ute maskiner", unreachable: "svarade inte", unreadable: "kunde inte läsas", invalid: "inte en adress", invalid_site: "inte en adress", rate_limited: "för många test" }[r] || r || "");
