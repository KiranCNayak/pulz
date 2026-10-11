# Deployment — Pulz

How Pulz runs in production, and how to switch it on and off. The why is
Decision #71 (on demand) and `ARCHITECTURE.md` §4/§9; monitoring is
`docs/OBSERVABILITY.md`.

## The setup

| Piece | Where | Cost while idle | Switched off between games? |
|---|---|---|---|
| Frontend (`https://pulz.knayak.fyi`) | Cloudflare Pages, built from `main` | $0 | No, it's static files |
| Backend API + Socket.IO (`https://pulz-api.knayak.fyi`) | One Fly.io machine, Singapore (`sin`) | A few cents a month while stopped | **Yes: `make cloud-up` / `make cloud-down`** |
| Postgres | Neon free plan, AWS Singapore | $0, sleeps after 5 min idle | No |
| Monitoring (optional) | Grafana Cloud free tier | $0 | No |

The backend is the only part that costs money, so it's the only part you
turn on and off. Quizzes, Creator tokens and saved results live in Neon
and survive every stop. Live games are held in the backend's memory
(Decision #16), so stopping it ends any game in progress.

## Everyday use

```bash
make cloud-up       # start the backend, wait until it answers (~10-20s)
# ...create a quiz, run the game...
make cloud-down     # stop it
make cloud-status   # is it running?
```

While the backend is off, the site still loads and shows a "Pulz is
offline right now" bar, which disappears by itself within 15 seconds of
`make cloud-up`.

## Costs and the budget guard

Fly.io has **no spending cap and no billing alerts** (its own cost
management docs say so), so the limit comes from how the app is set up:

- **Only one small machine can exist** (`shared-cpu-1x`, 512 MB, no
  volume, no dedicated IPv4). Running non-stop for a whole month, it costs
  $4.69 (about ₹420), below a ₹1000 budget even if you never turn it off.
- **Nothing but you can start it.** Fly's auto-start is off, so bots and
  stray requests can't wake it.
- **The `cloud-guard` GitHub workflow is the circuit breaker.** Every hour
  it stops any machine that has been running longer than 6 hours, then
  fails, which makes GitHub email you. A forgotten `make cloud-up` costs
  about 5 cents instead of a month. Change the limit with a repository
  variable: `gh variable set PULZ_MAX_RUN_HOURS --body 4`.
- **The other services can't bill you.** Neon's free plan, Cloudflare
  Pages and Grafana Cloud's free tier have no card on file and stop or
  drop data at their limits instead of charging. Keep the Neon project on
  the Free plan.

| | Cost |
|---|---|
| One hour running | ~$0.0065 (about ₹0.6) |
| Stopped, per month (stored image, ~0.4 GB) | ~$0.06 |
| Data out to the internet, Singapore | $0.04/GB; a whole quiz night is a few MB |
| Typical month: 10 hours of games | ~$0.15 (about ₹13) |

The guard only runs while scheduled workflows are enabled. GitHub turns
them off in public repos after 60 days without a commit, after emailing a
warning first; `gh workflow enable cloud-guard` turns it back on.

## One-time setup

Do these in order. Each step is done once.

### 1. Tools

```bash
brew install flyctl
fly auth login
```

`make cloud-deploy` builds the image with your local Docker, so Docker
Desktop needs to be running for deploys (not for up/down).

### 2. Database (Neon)

1. Neon → **New project**, region **AWS Asia Pacific (Singapore)**,
   Postgres 16. A project's region can't change later; if an existing
   project is elsewhere, make a new one for Pulz.
2. Dashboard → **Connect** → turn **Connection pooling off** and copy the
   connection string. Prisma's migrations need this direct connection.
3. Keep only `sslmode=require` in its query string and add a connect
   timeout, which covers Neon waking up from sleep:
   `postgresql://<user>:<password>@<host>.ap-southeast-1.aws.neon.tech/<db>?sslmode=require&connect_timeout=15`

### 3. Backend (Fly.io)

```bash
fly apps create pulz-api
fly secrets set --stage --app pulz-api DATABASE_URL='<the Neon string from step 2>'
make cloud-deploy
```

`make cloud-deploy` builds `backend/Dockerfile.prod`, runs the migrations
against Neon (`backend/scripts/release.sh`, which stops early if
`DATABASE_URL` is the pooled string), then starts one machine. If `pulz-api` is taken,
pick another name and change `app` in `backend/fly.toml` plus the CNAME
target below.

Check it:

```bash
curl https://pulz-api.fly.dev/health    # {"status":"ok",...}
fly ips list --app pulz-api             # expect "shared" v4 and a v6
```

If `fly ips list` shows a v4 that isn't marked shared, it's a dedicated
one billed at $2/month even while stopped: `fly ips release <address>`.

### 4. DNS (Cloudflare, `knayak.fyi` zone)

| Type | Name | Target | Proxy status |
|---|---|---|---|
| CNAME | `pulz-api` | `pulz-api.fly.dev` | **DNS only** (grey cloud) |
| CNAME | `pulz` | `<project>.pages.dev` | Proxied; created for you in step 5 |

Add the `pulz-api` record now, then ask Fly for its certificate:

```bash
fly certs add pulz-api.knayak.fyi --app pulz-api
fly certs check pulz-api.knayak.fyi --app pulz-api   # repeat until "Issued"
```

`pulz-api` must stay **DNS only**. Through Cloudflare's proxy, every
request would reach Fly from a Cloudflare address, so the rate limiters
would see one shared IP, and Fly couldn't issue the certificate with its
default check.

Don't add the `pulz` record by hand: a manually-made record that points at
Pages before the domain is attached there returns errors. Step 5 creates
it.

### 5. Frontend (Cloudflare Pages)

1. Cloudflare → Workers & Pages → Create → Pages → **Connect to Git** →
   `KiranCNayak/pulz`.
2. Build settings:
   - Production branch: `main`
   - Framework preset: None
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `frontend`
3. Environment variables (Production):

   | Variable | Value |
   |---|---|
   | `VITE_API_URL` | `https://pulz-api.knayak.fyi` |
   | `VITE_SOCKET_URL` | `https://pulz-api.knayak.fyi` |
   | `NODE_VERSION` | `22` |
   | `VITE_FARO_URL` | Optional, see `docs/OBSERVABILITY.md` |

4. Save and deploy. Then the project → **Custom domains** → Set up a
   custom domain → `pulz.knayak.fyi`. Because `knayak.fyi` is on the same
   Cloudflare account, this creates the `pulz` CNAME itself.

Every push to `main` now rebuilds the frontend. Unknown paths such as
`/play/<id>` serve `index.html`, which is Pages' default for a site with
no `404.html`, so deep links work.

The backend only accepts browser requests from `https://pulz.knayak.fyi`
(`CORS_ORIGIN` in `backend/fly.toml`), so Pages' `*.pages.dev` preview
URLs load but can't reach the API.

### 6. Budget guard (GitHub)

```bash
fly tokens create deploy --app pulz-api --expiry 8760h   # app-scoped, 1 year
gh secret set FLY_API_TOKEN --repo KiranCNayak/pulz    # paste the whole token, including "FlyV1 "
gh workflow run cloud-guard --repo KiranCNayak/pulz
```

The manual run should pass and log how long the machine has been
running. Check that GitHub → Settings → Notifications → Actions has
email on for failed workflows; that email is the alert. Renew the token
before it expires in a year; until then the guard keeps working.

### 7. Monitoring (optional)

Follow `docs/OBSERVABILITY.md` steps 1-4 and 6. Skip its step 5 (the
uptime check): the backend is off most of the time on purpose, so the
check would report an outage constantly.

### 8. Done

```bash
make cloud-down
```

From here on it's `make cloud-up` before a game and `make cloud-down`
after.

## Shipping changes

- **Frontend:** push to `main`; Pages rebuilds it.
- **Backend:** `make cloud-deploy`, then `make cloud-down` if it's
  running and you're done. Deploys are manual on purpose: an automatic one
  on every push would start the machine. Migrations run on each deploy,
  before the new version goes live.

## Troubleshooting

- **`make cloud-up` times out:** `fly logs --app pulz-api`. A database
  error usually means `DATABASE_URL` is the pooled Neon string or has extra
  parameters (step 2).
- **Deploy fails with `P1002 … Timed out trying to acquire a postgres
  advisory lock`:** shouldn't happen any more. `backend/scripts/release.sh`
  refuses the pooled connection string and skips Prisma's migration lock
  (only the release machine ever migrates, so the lock guards nothing
  here). It did happen on the first deploy: an earlier run, through the
  pooled string or killed mid-migration, left the lock held in Neon. If
  it comes back, or to clear a lock left over from then, Neon → your
  project → **SQL Editor**:

  ```sql
  -- who holds it (Prisma's lock id is 72707369)
  SELECT l.pid, a.state, a.backend_start, a.state_change, left(a.query, 80) AS last_query
  FROM pg_locks l JOIN pg_stat_activity a USING (pid)
  WHERE l.locktype = 'advisory' AND l.objid = 72707369;

  -- release it
  SELECT pg_terminate_backend(pid) FROM pg_locks
  WHERE locktype = 'advisory' AND objid = 72707369;
  ```

  If the second query is refused, restart the compute instead (branch
  overview → the compute's menu → Restart), which drops every connection.
  Then `make cloud-deploy` again.
- **The site loads but says offline after `cloud-up`:** check
  `https://pulz-api.knayak.fyi/health` directly. If that works, the
  frontend was built without `VITE_API_URL`: set it in Pages and redeploy
  (Vite bakes it in at build time).
- **Browser console shows CORS errors:** `CORS_ORIGIN` in
  `backend/fly.toml` must exactly match the address in the browser bar.
- **Certificate stuck:** `fly certs check pulz-api.knayak.fyi`, and make
  sure the `pulz-api` record is DNS only.

## Removing it entirely

Not part of normal use; this deletes the data too.

```bash
fly apps destroy pulz-api
```

Then delete the Pages project, the Neon project, the two DNS records and
the `FLY_API_TOKEN` repository secret.
