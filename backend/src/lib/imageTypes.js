// What an image file really is, from its first bytes — a renamed file or an
// HTML page served as "image/png" doesn't pass.
const SIGNATURES = [
  { mime: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", ext: "gif", test: (b) => b.slice(0, 3).toString("ascii") === "GIF" },
  { mime: "image/webp", ext: "webp", test: (b) => b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP" },
];

export const sniffImage = (buffer) => (buffer && buffer.length >= 12 ? SIGNATURES.find((s) => s.test(buffer)) || null : null);
