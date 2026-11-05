# Runbook

How Evenly is deployed and what to do when something needs attention. Written 2026-11-04.

## Where everything lives

| Piece | Where | Address |
|---|---|---|
| Web app | Vercel (project root `client`) | https://evenly-s.vercel.app |
| API | Render web service (root `server`) | https://evenly-dz7y.onrender.com |
| Database | Neon (a **production** project; never the dev or test branches) | dashboard only |
| Code | GitHub, branch `main` | https://github.com/SahilSameer18/Evenly |

The browser only ever talks to the Vercel address. `client/vercel.json` forwards `/api/*` to Render and sends every other path to `index.html` (so refreshing on `/settle` works). That keeps the login cookie on one site, so no custom domain is needed.

## Settings (set in the dashboards, never committed)

**Render, Environment**

| Name | Value |
|---|---|
| `NODE_ENV` | `production` (turns on `Secure` cookies and proxy trust) |
| `DATABASE_URL` | Neon **pooled** connection string of the production database |
| `DIRECT_URL` | Neon **direct** connection string of the same database (used by migrations) |
| `JWT_ACCESS_SECRET` | 32 or more random characters, different from the dev one. Make one on your own computer: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CLIENT_ORIGIN` | exactly `https://evenly-s.vercel.app` (no trailing slash). CORS and the CSRF check compare against it |
| `TRUST_PROXY` | `2` (Vercel, then Render). See "Check the proxy count" below |

**Render, Build and start:** build command `npm ci && npm run build && npm run migrate`, start command `npm start`, health check path `/health`, Node 24. Running the migrations in the build is safe to repeat (it only applies new ones), and a failing migration fails the build, so the old version keeps running.

**Vercel:** no environment variables. Settings read from `client/vercel.json`.

## Deploying a change

1. Commit and push to `main`. Render and Vercel both redeploy on their own.
2. Check `https://evenly-dz7y.onrender.com/health` and `/ready` both answer 200 (`/ready` also reaches the database), then open the site.
3. If you changed the database (a new folder in `server/prisma/migrations`), the Render build applied it. Migrations only go forward: to undo one, write a new migration.

## Rolling back

- **API:** Render, Deploys, pick the last good deploy, Rollback.
- **Web app:** Vercel, Deployments, open the last good one, Promote to Production.
- Rolling back code does not undo a migration. If a bad migration got in, restore the database (next section).

## Backups and restore

Neon keeps a history you can restore from (the window depends on your plan: check Neon, project Settings). To recover:
1. Neon, your production project, Branches, Restore (or "Time Travel"), choose a time just before the problem, restore **into a new branch** first.
2. Look at the data in that branch (Tables view, or connect with the direct string). If it is right, either point Render's `DATABASE_URL` and `DIRECT_URL` at the new branch, or restore over the main branch.
3. Do one practice restore into a scratch branch before you rely on this, and note the date here: **drill done: not yet**.

## Reading the logs

Render, Logs. Every line is JSON with a request id. When the app shows an error with "Reference: <id>", search the logs for that id to see the request and any error. A `balances do not reconcile` error line means the books stopped adding up for a household: stop and investigate that household.

## The free plan sleeps

On Render's free plan the API sleeps after about 15 idle minutes. The next request takes 30 to 60 seconds and the in-memory rate limits reset. Neon also pauses when idle (a short extra delay). The Starter plan removes the sleep. An uptime pinger on `/health` every 10 minutes also keeps it awake; it sends no data, only that one request. To set one up: make a free account on an uptime monitor such as UptimeRobot, add an HTTP monitor for `https://evenly-dz7y.onrender.com/health` with a 10-minute interval, and nothing else. Until then, the app shows a "Waking up the server" screen while the first request waits.

## Check the proxy count (once, after the first live deploy)

The API needs the right number of proxies in front of it, or failed-login limits are shared by everyone (too low) or can be faked (too high).
1. From your laptop, send several wrong logins to the live site (for example through the app's login form).
2. From your phone on mobile data (not Wi-Fi), do the same.
3. The wrong-password limit must be counted **separately** for the two networks. If the phone is blocked after the laptop's attempts, `TRUST_PROXY` is too low: raise it by one and redeploy. If both get fresh counts but a header such as `X-Forwarded-For` set by the client changes the result, it is too high: lower it.

## Rotating the secret

Change `JWT_ACCESS_SECRET` in Render. Access tokens last 15 minutes and are refreshed automatically from the cookie, so people are not logged out; refresh tokens are random values stored hashed in the database and do not depend on the secret.

## Cost notes

Vercel Hobby and Neon free are enough to start (Hobby is for non-commercial use). Render free works but sleeps; Starter is about $7 a month.
