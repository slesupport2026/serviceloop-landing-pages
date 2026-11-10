/* SLE Group Signing — shared helpers.
   Data lives in the SLE Payroll Supabase project, schema `legal`.
   Pages talk to it only through public.legal_* functions (see sign/README.md). */
window.SIGN = (function () {
  const SB_URL = "https://gkwdhpwugefrqaaycnch.supabase.co";
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdrd2RocHd1Z2VmcnFhYXljbmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNDg1MDUsImV4cCI6MjEwMzkyNDUwNX0.e1fID9xhXNlwKcI95QWD8OoOD2V_jwnWhjW0LTmiO90";
  const VERSION = "2026.11.9";

  async function rpc(fn, args) {
    const r = await fetch(SB_URL + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args || {})
    });
    const txt = await r.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!r.ok) {
      let msg = (data && data.message) || "Something went wrong. Please try again.";
      msg = msg.replace(/^(SIGN|ADMIN):\s*/, "");
      if (/duplicate key|agreements_one_live_per_email/.test(msg)) msg = "This email has already signed for this session.";
      const err = new Error(msg); err.status = r.status; throw err;
    }
    return data;
  }

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qs = k => new URLSearchParams(location.search).get(k);

  function fmtDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  }
  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  function fmtDate(isoDate) {
    if (!isoDate) return "";
    const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }

  /* Signature pad: pointer events, smooth strokes, crisp on retina. */
  function SignaturePad(canvas, onChange) {
    const ctx = canvas.getContext("2d");
    let drawing = false, last = null, strokes = 0;
    function size() {
      const r = canvas.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1);
      const keep = strokes ? canvas.toDataURL() : null;
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0F1629";
      if (keep) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = keep; }
    }
    const pt = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || .5 }; };
    canvas.addEventListener("pointerdown", e => {
      e.preventDefault(); canvas.setPointerCapture(e.pointerId); drawing = true; last = pt(e);
      ctx.beginPath(); ctx.arc(last.x, last.y, 1.4, 0, Math.PI * 2); ctx.fillStyle = "#0F1629"; ctx.fill();
    });
    canvas.addEventListener("pointermove", e => {
      if (!drawing) return; e.preventDefault();
      const p = pt(e);
      ctx.lineWidth = 2.2 + (e.pointerType === "pen" ? p.p * 2 : 0.8);
      ctx.beginPath(); ctx.moveTo(last.x, last.y);
      const mx = (last.x + p.x) / 2, my = (last.y + p.y) / 2;
      ctx.quadraticCurveTo(last.x, last.y, mx, my); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
    });
    const end = () => { if (drawing) { drawing = false; strokes++; onChange && onChange(); } };
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end); canvas.addEventListener("pointerleave", end);
    window.addEventListener("resize", size); size();
    return {
      clear() { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore(); strokes = 0; onChange && onChange(); },
      isEmpty() { return strokes === 0; },
      /* Trimmed PNG, max 700px wide, transparent background. */
      toPNG() {
        const w = canvas.width, h = canvas.height, data = ctx.getImageData(0, 0, w, h).data;
        let x0 = w, y0 = h, x1 = 0, y1 = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x1 <= x0) return null;
        const pad = 12; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w, x1 + pad); y1 = Math.min(h, y1 + pad);
        const cw = x1 - x0, ch = y1 - y0, scale = Math.min(1, 700 / cw);
        const out = document.createElement("canvas"); out.width = Math.round(cw * scale); out.height = Math.round(ch * scale);
        out.getContext("2d").drawImage(canvas, x0, y0, cw, ch, 0, 0, out.width, out.height);
        return out.toDataURL("image/png");
      }
    };
  }

  /* Contract body. opts.initials: array of initials to show (copy page);
     opts.inputs: true to render initials inputs (signing page). */
  function contractHTML(c, opts) {
    opts = opts || {};
    const box = i => opts.inputs
      ? `<label class="init"><span>Initials</span><input data-init="${i}" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Your initials"></label>`
      : opts.initials ? `<span class="init done"><span>Initials</span><b>${esc(opts.initials[i])}</b></span>` : "";
    const n = c.commitments.length;
    return `
      <section class="block">
        <h2>${esc(c.we_title || "We commit to")}</h2>
        <ul class="we">${c.we.map(w => `<li>${esc(w)}</li>`).join("")}</ul>
      </section>
      <section class="block">
        <h2>${esc(c.i_title || "I commit to")}</h2>
        <p class="hint">${opts.inputs ? "Read each line and put your initials next to it." : "Initialed by the participant."}</p>
        <ol class="mine">${c.commitments.map((m, i) => `
          <li class="line" data-line="${i}">
            <div class="txt"><strong>${esc(m.title)}</strong> ${esc(m.text)}</div>${box(i)}
          </li>`).join("")}</ol>
      </section>
      <section class="block money">
        <h2>${esc(c.investment_title || "Investment")}</h2>
        <div class="line" data-line="${n}"><div class="txt">${esc(c.investment)}</div>${box(n)}</div>
      </section>
      <section class="block guarantee">
        <h2>${esc(c.guarantee_title)}</h2>
        <p>${esc(c.guarantee)}</p>
      </section>
      <p class="closing">${esc(c.closing)}</p>`;
  }

  return { SB_URL, SB_KEY, VERSION, rpc, esc, qs, fmtDateTime, fmtTime, fmtDate, SignaturePad, contractHTML };
})();
