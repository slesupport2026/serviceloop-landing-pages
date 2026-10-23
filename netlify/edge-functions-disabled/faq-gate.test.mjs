// Tests for the /FAQs password gate.
//
//   node netlify/edge-functions/faq-gate.test.mjs
//
// Runs on plain Node (24+) by stubbing the only two runtime globals the
// function touches: Netlify.env and crypto.subtle. No Netlify CLI needed.
//
// This is the security boundary for unreleased SLE curriculum, so the cases
// that matter most are the negative ones: fails closed with no env var,
// rejects forged and stale cookies, and never leaks page content in a 401.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "faq-gate.js");

// The function is written for Deno/Netlify edge; copy to .mjs so Node will
// load it as an ES module regardless of this repo's package.json.
const tmp = path.join(os.tmpdir(), `faq-gate-${process.pid}.mjs`);
fs.copyFileSync(SRC, tmp);

let PASSWORD = "correct-horse";
globalThis.Netlify = {
  env: { get: (k) => (k === "FAQ_PASSWORD" ? PASSWORD : undefined) },
};

const mod = await import("file://" + tmp.replace(/\\/g, "/"));
const gate = mod.default;

const URL_FAQ = "https://go.serviceloopelectrical.com/FAQs/";
let served = false;
const ctx = {
  next: () => {
    served = true;
    return new Response("SECRET CONTENT: Simple Service Rate", { status: 200 });
  },
};

async function sha256(v) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
};

console.log("\nconfig");
check("gates /FAQs and /FAQs/*",
  JSON.stringify(mod.config.path) === JSON.stringify(["/FAQs", "/FAQs/*"]),
  JSON.stringify(mod.config.path));

console.log("\nunauthenticated GET");
served = false;
let r = await gate(new Request(URL_FAQ), ctx);
let body = await r.clone().text();
check("returns 401", r.status === 401, `got ${r.status}`);
check("does NOT serve the page", !served);
check("serves a login form", body.includes('name="password"'));
check("leaks no answer content", !body.includes("Simple Service Rate"));
check("sets noindex header", !!r.headers.get("x-robots-tag")?.includes("noindex"));
check("no-store", r.headers.get("cache-control") === "no-store");

console.log("\nPOST with wrong password");
served = false;
let fd = new FormData(); fd.set("password", "nope");
r = await gate(new Request(URL_FAQ, { method: "POST", body: fd }), ctx);
body = await r.clone().text();
check("returns 401", r.status === 401, `got ${r.status}`);
check("does NOT serve the page", !served);
check("shows the error", body.includes("didn't work"));
check("sets no cookie", !r.headers.get("set-cookie"));

console.log("\nPOST with correct password");
served = false;
fd = new FormData(); fd.set("password", PASSWORD);
r = await gate(new Request(URL_FAQ, { method: "POST", body: fd }), ctx);
const cookie = r.headers.get("set-cookie") || "";
const expected = await sha256(PASSWORD);
check("redirects (303)", r.status === 303, `got ${r.status}`);
check("redirects back to /FAQs/", r.headers.get("location") === "/FAQs/");
check("sets the cookie", cookie.startsWith("sle_faq="));
check("cookie is HttpOnly", cookie.includes("HttpOnly"));
check("cookie is Secure", cookie.includes("Secure"));
check("cookie scoped to /FAQs", cookie.includes("Path=/FAQs"));
check("cookie has no plaintext password", !cookie.includes(PASSWORD));
check("cookie value is the SHA-256", cookie.includes(expected));

console.log("\nsession handling");
served = false;
r = await gate(new Request(URL_FAQ, { headers: { cookie: `sle_faq=${expected}` } }), ctx);
check("valid cookie serves the page", served && r.status === 200);

served = false;
r = await gate(new Request(URL_FAQ, { headers: { cookie: "sle_faq=deadbeef" } }), ctx);
check("forged cookie rejected", !served && r.status === 401);

served = false;
r = await gate(new Request(URL_FAQ, {
  headers: { cookie: `sle_faq=${await sha256("old-password")}` } }), ctx);
check("stale cookie rejected after a password rotation", !served && r.status === 401);

served = false;
r = await gate(new Request(URL_FAQ, {
  headers: { cookie: `_ga=GA1.2.999; sle_faq=${expected}; other=x` } }), ctx);
check("cookie found among others", served && r.status === 200);

served = false;
r = await gate(new Request(URL_FAQ, {
  headers: { cookie: `evil=sle_faq=${expected}` } }), ctx);
check("prefix smuggling rejected", !served,
  "a naive indexOf() check would wrongly pass this");

console.log("\nFAQ_PASSWORD missing (must fail closed)");
served = false;
PASSWORD = undefined;
r = await gate(new Request(URL_FAQ), ctx);
check("returns 503", r.status === 503, `got ${r.status}`);
check("does NOT serve the page", !served);

fs.unlinkSync(tmp);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
