// Probe the admin ecosystem CRM service against the live DB.
import { getEcosystemFunnel, listEcosystemPeople, getEcosystemPersonDetail } from "../src/services/adminEcosystem.js";

const funnel = await getEcosystemFunnel();
console.log("FUNNEL:", JSON.stringify(funnel));

const all = await listEcosystemPeople({ limit: 3 });
console.log("PEOPLE total:", all.total, "counts:", JSON.stringify(all.counts));

const hostRow = (await listEcosystemPeople({ segment: "host", limit: 1 })).items[0];
const d = await getEcosystemPersonDetail(hostRow.personId);
console.log("DETAIL", d.person.name, "| kind:", d.kind, "| roles:", d.roles.join(","));
console.log("  hostEvents:", d.hostEvents.length, "attended:", d.attended.length, "communities:", d.communities.length, "timeline:", d.timeline.length, "sales:", d.sales?.status || "none");

const leadRow = (await listEcosystemPeople({ segment: "lead", limit: 50 })).items.find(i => String(i.personId).startsWith("lead:"));
if (leadRow) {
  const ld = await getEcosystemPersonDetail(leadRow.personId);
  console.log("SILO LEAD", ld.person.name, "| kind:", ld.kind, "| sales:", ld.sales?.status);
}
const profRow = (await listEcosystemPeople({ segment: "host", limit: 200 })).items.find(i => String(i.personId).startsWith("profile:"));
if (profRow) {
  const pd = await getEcosystemPersonDetail(profRow.personId);
  console.log("SILO PROFILE", pd.person.name, "| kind:", pd.kind, "| hostEvents:", pd.hostEvents.length);
}
process.exit(0);
