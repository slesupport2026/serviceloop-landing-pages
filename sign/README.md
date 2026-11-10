# Group Signing (`/sign/`)

Live group signing for onboarding calls (Night School first; any program later).

| Page | URL | Who |
|---|---|---|
| Signer | `go.serviceloopelectrical.com/sign/<code>` | Participants, on their phone or laptop |
| Live wall | `/sign/wall/?s=<code>` | Host screen-shares this. `Q` toggles the QR panel, `F` goes full screen |
| Copy | `/sign/copy/?id=…&k=…` | Each signer's permanent copy (Save as PDF) |
| Host | `/sign/host/` | Create sessions, open/close, countersign, export CSV, void. Passcode required (not stored in this repo) |

## Data
SLE Payroll Supabase project (`gkwdhpwugefrqaaycnch`), schema **`legal`**. The schema is NOT exposed to the API;
pages only call `public.legal_*` functions (security definer). Realtime reads `legal.wall` (names + signatures only, no emails).

- `legal.templates`: versioned agreement text (`key` + `version`). To change wording, INSERT a new version. Never edit an old one.
- `legal.sessions`: one per call. Copies the latest template's text when created (frozen + SHA-256 fingerprint).
  The contract can't change once anyone has signed.
- `legal.agreements`: one row per signature, with the **full contract snapshot**, initials, signature PNG, consent text,
  server timestamp, IP, user agent and fingerprint. A trigger blocks edits and deletes. Only voiding is allowed.
- `legal.wall`: public copy for the live screen.
- `legal.admin`: bcrypt hash of the host passcode. To change it:
  `update legal.admin set pass_hash = extensions.crypt('<new>', extensions.gen_salt('bf'));`

## Adding another program
Insert a template with the same JSON shape as `night-school-onboarding` v1 (heading, intro, we[], commitments[{title,text}],
investment, guarantee_title/guarantee, closing, consent, company, countersigner). It then shows up in the host's Agreement list.
