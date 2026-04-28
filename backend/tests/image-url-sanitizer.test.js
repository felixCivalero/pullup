import { publicSupabaseUrl, sanitizeBlockUrls } from "../src/services/imageUrlSanitizer.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

// publicSupabaseUrl ------------------------------------------------------

console.log("🧪 publicSupabaseUrl converts a signed URL to public");
{
  const signed = "https://abc123.supabase.co/storage/v1/object/sign/event-images/cover/foo.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.X";
  const out = publicSupabaseUrl(signed);
  assert(
    out === "https://abc123.supabase.co/storage/v1/object/public/event-images/cover/foo.jpg",
    `signed → public (got: ${out})`,
  );
  assert(!out.includes("token="), "no token query left");
}

console.log("🧪 publicSupabaseUrl is a no-op for already-public URLs");
{
  const pub = "https://abc123.supabase.co/storage/v1/object/public/event-images/cover/foo.jpg";
  assert(publicSupabaseUrl(pub) === pub, "public URL unchanged");
}

console.log("🧪 publicSupabaseUrl is a no-op for arbitrary http URLs");
{
  const ext = "https://cdn.example.com/foo.png";
  assert(publicSupabaseUrl(ext) === ext, "external URL unchanged");
}

console.log("🧪 publicSupabaseUrl handles bad input safely");
{
  assert(publicSupabaseUrl("") === "", "empty stays empty");
  assert(publicSupabaseUrl(null) === null, "null stays null");
  assert(publicSupabaseUrl(undefined) === undefined, "undefined stays undefined");
}

// sanitizeBlockUrls ------------------------------------------------------

console.log("🧪 sanitizeBlockUrls rewrites image blocks only");
{
  const signed = "https://abc.supabase.co/storage/v1/object/sign/event-images/x.jpg?token=y";
  const blocks = [
    { type: "text", style: "paragraph", text: signed }, // text URL stays
    { type: "image", url: signed, alt: "Cover", width: 100, align: "center" },
    { type: "button", text: "Click", url: signed }, // button URL is intentional, stays
    { type: "image", url: "https://cdn.example.com/x.png" }, // already public
  ];
  const out = sanitizeBlockUrls(blocks);
  assert(out[0].text === signed, "text block text untouched");
  assert(
    out[1].url === "https://abc.supabase.co/storage/v1/object/public/event-images/x.jpg",
    "image block url rewritten",
  );
  assert(out[1].alt === "Cover" && out[1].width === 100, "other image block fields preserved");
  assert(out[2].url === signed, "button URL untouched (intentional)");
  assert(out[3].url === "https://cdn.example.com/x.png", "external image url unchanged");
}

console.log("🧪 sanitizeBlockUrls handles empty / non-array");
{
  assert(Array.isArray(sanitizeBlockUrls([])), "[] returns []");
  assert(sanitizeBlockUrls([]).length === 0, "[] stays empty");
  assert(sanitizeBlockUrls(undefined) === undefined, "undefined passthrough");
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
