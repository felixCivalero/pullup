// Upload data-URL hostedby logos in event sections to storage (create/update/image routes).
import { sniffUploadedImage } from "../lib/uploads.js";
// ---------------------------
// Helper: Upload hostedby logos from sections to Supabase Storage
// Replaces base64 data URLs with storage URLs so JSONB stays small
// ---------------------------
async function processHostedByLogos(eventId, sections) {
  if (!Array.isArray(sections)) return sections;

  const hostedByIdx = sections.findIndex(
    (s) => s.type === "hostedby" && s.logo && s.logo.startsWith("data:image/")
  );
  if (hostedByIdx === -1) return sections; // nothing to upload

  const section = sections[hostedByIdx];
  const { buffer, extension, mime } = sniffUploadedImage(section.logo, {
    maxBytes: 512 * 1024,
    label: "Hosted-by logo",
  });
  const fileName = `${eventId}/hostedby_logo.${extension}`;

  const { supabase } = await import("../supabase.js");
  const { error } = await supabase.storage
    .from("event-images")
    .upload(fileName, buffer, {
      contentType: mime,
      upsert: true,
    });

  if (error) {
    console.error("Hosted-by logo upload error:", error);
    throw new Error("Failed to upload hosted-by logo");
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from("event-images")
    .getPublicUrl(fileName);

  const updated = [...sections];
  updated[hostedByIdx] = { ...updated[hostedByIdx], logo: publicUrl };
  return updated;
}
export { processHostedByLogos };
