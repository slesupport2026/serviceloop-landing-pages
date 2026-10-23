// Password gate for /FAQs — the internal FAQ review page.
//
// This runs on Netlify's edge BEFORE the static file is served, so someone
// without the password never receives the page at all. That matters here: the
// page contains $1M+ Offers curriculum and Joseph's Salesbot DNA, which a
// client-side PIN would have shipped to every visitor inside the HTML (and let
// Google index).
//
// The password lives in the FAQ_PASSWORD environment variable in the Netlify
// UI — never in this repo.
//
// The cookie stores a SHA-256 of the password, not the password itself, so a
// browser profile leak doesn't hand over the plaintext.

const COOKIE = "sle_faq";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function hash(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function loginPage(failed) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>SLE — Protected</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;
    justify-content:center;background:#0D0D0D;color:#E8E8E8;padding:24px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .box{width:100%;max-width:380px;text-align:center}
  .mark{font-size:11px;letter-spacing:.22em;text-transform:uppercase;
    color:#C9A45A;font-weight:700;margin-bottom:20px}
  h1{font-size:25px;margin:0 0 10px;color:#fff;font-weight:800;letter-spacing:-.01em}
  p{color:#9A9A9A;font-size:14.5px;margin:0 0 26px;line-height:1.6}
  input{width:100%;background:#161616;border:1px solid #2C2C2C;border-radius:6px;
    color:#E8E8E8;padding:13px 15px;font-size:16px;font-family:inherit;
    text-align:center;letter-spacing:.04em}
  input:focus{outline:none;border-color:#C9A45A}
  button{width:100%;margin-top:11px;background:#C9A45A;border:0;border-radius:6px;
    color:#111;padding:13px;font-size:15px;font-weight:700;cursor:pointer;
    font-family:inherit;letter-spacing:.02em}
  button:hover{background:#E8C97A}
  .err{color:#E07A5F;font-size:13.5px;margin-top:15px;font-weight:600}
  .foot{margin-top:30px;font-size:12px;color:#5a5a5a}
</style>
</head>
<body>
  <div class="box">
    <div class="mark">Service Loop Electrical</div>
    <h1>This page is private</h1>
    <p>Internal review material. Enter the password to continue.</p>
    <form method="POST" autocomplete="off">
      <input type="password" name="password" placeholder="Password" autofocus
             aria-label="Password">
      <button type="submit">Enter</button>
    </form>
    ${failed ? '<div class="err">That password didn\'t work. Try again.</div>' : ""}
    <div class="foot">For Electricians. By Electricians.</div>
  </div>
</body>
</html>`;
}

function page(body, status) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export default async (request, context) => {
  const password = Netlify.env.get("FAQ_PASSWORD");

  // Fail closed. A missing env var must never expose the page.
  if (!password) {
    return page(
      "<h1>Not configured</h1><p>FAQ_PASSWORD is not set in Netlify.</p>",
      503,
    );
  }

  const token = await hash(password);
  const cookies = request.headers.get("cookie") || "";
  const authed = cookies
    .split(";")
    .some((c) => c.trim() === `${COOKIE}=${token}`);

  if (authed) return context.next();

  if (request.method === "POST") {
    const form = await request.formData();
    if (form.get("password") === password) {
      return new Response(null, {
        status: 303,
        headers: {
          location: new URL(request.url).pathname,
          "set-cookie":
            `${COOKIE}=${token}; Path=/FAQs; HttpOnly; Secure; ` +
            `SameSite=Lax; Max-Age=${MAX_AGE}`,
          "cache-control": "no-store",
        },
      });
    }
    return page(loginPage(true), 401);
  }

  return page(loginPage(false), 401);
};

export const config = { path: ["/FAQs", "/FAQs/*"] };
