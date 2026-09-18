// Serves the built web app (embedded at deploy time by scripts/build-app.sh) so the whole POC
// lives on the Supabase project: https://<ref>.supabase.co/functions/v1/app/
import { FILES } from "./bundle.ts";

const PREFIX = "/app";

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Decode once per isolate; the bundle is small.
const CACHE = new Map<string, { type: string; body: Uint8Array }>();
function file(path: string) {
  const hit = CACHE.get(path);
  if (hit) return hit;
  const f = FILES[path];
  if (!f) return null;
  const entry = { type: f.t, body: decode(f.b) };
  CACHE.set(path, entry);
  return entry;
}

Deno.serve((req) => {
  let path = new URL(req.url).pathname.replace(/^\/functions\/v1/, "");
  if (path.startsWith(PREFIX)) path = path.slice(PREFIX.length);
  if (path === "" || path.endsWith("/")) path += "index.html";
  const asset = file(path) ?? (path.includes(".") ? null : file("/index.html"));
  if (!asset) return new Response("Not found", { status: 404 });
  const immutable = path.startsWith("/assets/");
  const textual = asset.type.startsWith("text/") || asset.type.includes("javascript") ||
    asset.type.includes("json") || asset.type.includes("svg");
  const type = textual ? `${asset.type}; charset=utf-8` : asset.type;
  return new Response(new Blob([asset.body as BlobPart], { type }), {
    headers: {
      "content-type": type,
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
});
