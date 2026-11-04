// Post-Call Facts: approximate city / region / country of whoever logs a call, from Netlify's network geo.
// No browser permission prompt. Stored with each call in pcf.submission_meta (SLE Tools).
import type { Context } from "https://edge.netlify.com";

export default (_req: Request, context: Context) =>
  new Response(JSON.stringify({
    city: context.geo?.city ?? null,
    region: context.geo?.subdivision?.code ?? context.geo?.subdivision?.name ?? null,
    country: context.geo?.country?.code ?? null,
    time_zone: context.geo?.timezone ?? null,
    ip: context.ip ?? null,
  }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const config = { path: "/facts-geo" };
