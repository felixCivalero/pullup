// Working together: the calls behind the Team page, an event's co-hosts
// and the invites (backend lib/teams.js), with the server's refusals in
// Swedish.
import { authenticatedFetch } from "./api.js";

// Reads the server's answer; throws its message (in Swedish where we know it).
const SV = {
  email: "Det där är ingen mejladress.",
  self: "Det är du.",
  already: "Den personen är redan med.",
  too_many: "Teamet är fullt (max 50).",
};
export async function teamCall(path, method = "POST", body) {
  const res = await authenticatedFetch(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429) throw new Error("För många inbjudningar på kort tid. Vänta en stund.");
    throw new Error(SV[out.detail] || "Det gick inte. Försök igen.");
  }
  return out;
}

export const teamApi = {
  brand: () => teamCall("/admin/team", "GET"),
  inviteToBrand: (email) => teamCall("/admin/team/invites", "POST", { email }),
  removeMember: (userId) => teamCall(`/admin/team/members/${userId}`, "DELETE"),
  event: (id) => teamCall(`/admin/events/${id}/team`, "GET"),
  inviteToEvent: (id, email) => teamCall(`/admin/events/${id}/team`, "POST", { email }),
  removeCohost: (id, userId) => teamCall(`/admin/events/${id}/team/${userId}`, "DELETE"),
  cancel: (inviteId) => teamCall(`/admin/invites/${inviteId}`, "DELETE"),
};
