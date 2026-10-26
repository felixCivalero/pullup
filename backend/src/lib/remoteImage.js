// Fetch an image from a URL someone (or their assistant) gave us, safely:
// https only, never an address inside a private network (no reaching the
// server's own services or cloud metadata), the connection pinned to the
// address that was checked (no DNS rebinding), at most 3 redirects — each
// checked again — 10 seconds, 8 MB, and the bytes must really be an image.
import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import { sniffImage } from "./imageTypes.js";

export const MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

const V4_BLOCKED = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
const v4ToInt = (ip) => ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
const inV4 = (ip, [base, bits]) => bits === 0 || (v4ToInt(ip) >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits));

// True only for an address on the public internet.
export function isPublicAddress(ip) {
  if (net.isIPv4(ip)) return !V4_BLOCKED.some((range) => inV4(ip, range));
  if (!net.isIPv6(ip)) return false;
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPublicAddress(mapped[1]);
  if (v6 === "::" || v6 === "::1") return false;
  // Unique local fc00::/7, link-local fe80::/10, multicast ff00::/8, documentation 2001:db8::/32, NAT64 64:ff9b::/96.
  return !/^(f[cd]|fe[89ab]|ff|2001:0?db8:|64:ff9b:)/.test(v6);
}

async function publicAddressFor(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [{ address: host, family: net.isIPv6(host) ? 6 : 4 }] : await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || !addresses.every((a) => isPublicAddress(a.address))) return null;
  return addresses[0];
}

function get(url, address) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: TIMEOUT_MS,
      headers: { "User-Agent": "PullUp/1.0 (+https://pullup.se)", Accept: "image/*" },
      // Connect to the address we checked, whatever DNS says a moment later.
      lookup: (_host, options, cb) => (options?.all ? cb(null, [address]) : cb(null, address.address, address.family)),
    }, resolve);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

// → { buffer, mime, ext }. Throws an Error whose message says what was wrong.
export async function fetchRemoteImage(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || ""));
  } catch {
    throw new Error("That isn't a valid URL.");
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (url.protocol !== "https:") throw new Error("The image URL must start with https://.");
    if (url.username || url.password) throw new Error("The image URL can't contain a password.");
    const address = await publicAddressFor(url.hostname).catch(() => null);
    if (!address) throw new Error("That address can't be reached from PullUp.");
    const res = await get(url, address);
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
      res.resume();
      url = new URL(res.headers.location, url);
      continue;
    }
    if (res.statusCode !== 200) {
      res.resume();
      throw new Error(`The image URL answered ${res.statusCode}.`);
    }
    if (Number(res.headers["content-length"]) > MAX_REMOTE_IMAGE_BYTES) {
      res.destroy();
      throw new Error("The image is larger than 8 MB.");
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of res) {
      size += chunk.length;
      if (size > MAX_REMOTE_IMAGE_BYTES) {
        res.destroy();
        throw new Error("The image is larger than 8 MB.");
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const kind = sniffImage(buffer);
    if (!kind) throw new Error("That URL isn't a PNG, JPEG, GIF or WebP image.");
    return { buffer, mime: kind.mime, ext: kind.ext };
  }
  throw new Error("The image URL redirects too many times.");
}
