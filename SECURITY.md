# SECURITY

Grover is a high-privilege private system: API keys, personal + business
memory, and eventually automation. Treat it accordingly.

## Threat model (short version)

Public endpoints get scanned. A compromised Grover exposes the API key, both
users' memory, and any future tool privileges. External content (webpages,
PDFs, issues) can carry prompt injection. Defense: **external content is data,
not authority** — it's baked into the constitution, and future tool output
must always be framed as data, never as instructions.

## Local posture (v1 default)

- Binds `127.0.0.1:4370` — unreachable from the network.
- Secrets in `data/secrets.json` (0600 where the OS supports it), or
  `ANTHROPIC_API_KEY` env var. Never in git (`data/` is ignored).
- Every consequential action → `audit` table. Every model call → `model_calls`
  with tokens, cost, latency, and errors.
- Budget caps are enforced pre-call; overrides require an explicit click and
  are audited (`budget_override`).
- Path traversal blocked on both static serving and vault access; vault
  namespace visibility enforced server-side per user.

## Deploying to the Ubuntu server behind Cloudflare (the runbook)

Goal: `grover.<yourdomain>` reachable only by Will + Jackson, MFA'd, with the
origin never exposed. Same pattern as Jellyfin, plus Access in front.

1. **Install** Node 22 LTS on the server; clone the repo; `./start-grover.sh`
   once to verify boot. Keep `GROVER_HOST=127.0.0.1`.
2. **systemd service** (`/etc/systemd/system/grover.service`):

   ```ini
   [Unit]
   Description=GROVER
   After=network.target

   [Service]
   WorkingDirectory=/opt/grover
   ExecStart=/usr/bin/node grover.mjs
   Environment=GROVER_NO_OPEN=1
   Restart=on-failure
   User=grover
   NoNewPrivileges=true
   ProtectSystem=strict
   ReadWritePaths=/opt/grover/data /opt/grover/vault

   [Install]
   WantedBy=multi-user.target
   ```

   Run as a dedicated low-privilege `grover` user.
3. **Cloudflare Tunnel**: add a `cloudflared` ingress rule mapping
   `grover.<yourdomain>` → `http://127.0.0.1:4370`. The origin stays bound to
   localhost — the tunnel is the only way in. No port forwarding, ever.
4. **Cloudflare Access** (Zero Trust dashboard):
   - Application: `grover.<yourdomain>`.
   - Policy: Allow → Emails in list → Will's email + Jackson's email. Nothing else.
   - Require MFA in the identity provider or via Access policy.
   - Session duration: 24h or shorter.
5. **Identity wiring**: Access injects `Cf-Access-Authenticated-User-Email` on
   every request; Grover maps it to the matching profile (add Jackson's email
   to his user row via the DB or a future settings field). Unknown emails fall
   back to the default profile — tighten this to a 403 before onboarding
   anyone beyond the two of you.
6. **Verify**: from a non-allowed account, confirm you hit the Access wall.
   From an allowed one, confirm `Settings` shows the right profile.

**Do not** widen `GROVER_HOST` to `0.0.0.0` unless the tunnel setup requires
it (it shouldn't — cloudflared connects to localhost), and never before Access
is enforced.

## Standing rules

- No committed secrets. `.gitignore` covers `data/` and `vault/`; keep it that way.
- New tools/agents get narrow permissions by default (see AGENT_POLICY.md).
- Anything money-adjacent follows §6 autonomy levels with caps + kill switch —
  not implemented in v1, by design.
- Back up `data/` and `vault/` — they are the parts of Grover that can't be rebuilt.
