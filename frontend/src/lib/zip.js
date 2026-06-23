// Minimal store-only (no compression) ZIP builder — zero dependencies.
//
// Photos and videos are already compressed, so DEFLATE would burn CPU for ~no
// size win; "store" just frames each file with the right headers + CRC. Enough
// to bundle a multi-select of wall media into one .zip the browser saves
// instantly. Returns a Blob.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

// files: [{ name: string, data: Uint8Array }]
export function buildZip(files) {
  const enc = new TextEncoder();
  const body = [];     // local headers + file data, in order
  const central = [];  // central directory entries
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const size = data.length;

    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(0), ...u16(0),            // mod time, mod date
      ...u32(crc), ...u32(size), ...u32(size),
      ...u16(name.length), ...u16(0),  // name len, extra len
    ]);
    body.push(local, name, data);

    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(0), ...u16(0),            // mod time, mod date
      ...u32(crc), ...u32(size), ...u32(size),
      ...u16(name.length), ...u16(0), ...u16(0), // name, extra, comment len
      ...u16(0), ...u16(0), ...u32(0), // disk start, internal/external attrs
      ...u32(offset),                  // local header offset
    ]), name);

    offset += local.length + name.length + size;
  }

  const cdStart = offset;
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(cdStart), ...u16(0),
  ]);

  return new Blob([...body, ...central, eocd], { type: "application/zip" });
}
