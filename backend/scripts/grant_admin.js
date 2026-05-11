import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const needles = ["christoffer", "schiotte", "schiøtte"];

async function findAuthUsers() {
  const matches = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    for (const u of data.users) {
      const hay = [
        u.email || "",
        u.user_metadata?.full_name || "",
        u.user_metadata?.name || "",
        u.user_metadata?.first_name || "",
        u.user_metadata?.last_name || "",
      ]
        .join(" ")
        .toLowerCase();
      if (needles.some((n) => hay.includes(n.toLowerCase()))) {
        matches.push(u);
      }
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return matches;
}

const matches = await findAuthUsers();
console.log("Matches found:", matches.length);
for (const m of matches) {
  console.log(" -", m.id, m.email, JSON.stringify(m.user_metadata));
}
if (matches.length !== 1) {
  console.log("Stopping — need exactly one match, got", matches.length);
  process.exit(matches.length === 0 ? 1 : 2);
}
const authUser = matches[0];
console.log("Found auth user:", authUser.id, authUser.email);

const { data: existing, error: selErr } = await supabase
  .from("profiles")
  .select("id, is_admin")
  .eq("id", authUser.id)
  .maybeSingle();
if (selErr) throw selErr;
console.log("Existing profile:", existing);

if (!existing) {
  const { error: insErr } = await supabase
    .from("profiles")
    .insert({ id: authUser.id, is_admin: true });
  if (insErr) throw insErr;
  console.log("Created profile with is_admin=true");
} else {
  const { error: updErr } = await supabase
    .from("profiles")
    .update({ is_admin: true })
    .eq("id", authUser.id);
  if (updErr) throw updErr;
  console.log("Updated is_admin=true");
}

const { data: after } = await supabase
  .from("profiles")
  .select("id, is_admin")
  .eq("id", authUser.id)
  .single();
console.log("After:", after);
