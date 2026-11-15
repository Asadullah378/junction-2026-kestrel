# Kestrel in production

Set up on Sunday 15 November 2026 in the Google Cloud project `kestrel-contextdev`, region `europe-north1`. Every `gcloud` command below names the project: the default project on the machine it was set up from is another one.

- Site: https://kestrel.zeroanomaly.tech
- Health: `/api/health`

## What runs

| Piece | Name | Notes |
|---|---|---|
| Server | Cloud Run service `kestrel` | Exactly one instance, always on (min 1, max 1, CPU never throttled), 2 vCPU, 2 GB, requests up to 60 minutes. Running chats and the clock that starts watches live in its memory, so it must not scale. |
| Database | Cloud SQL `kestrel`, Postgres 17 | 1 vCPU, 3.75 GB, 10 GB disk. Database `kestrel`, user `kestrel`. The server reaches it through the socket Cloud Run mounts. |
| Secrets | Secret Manager | `DATABASE_URL`, `CONTEXT_DEV_API_KEY`, `OXYLABS_WEB_API_KEY`, `ANTHROPIC_AWS_API_KEY`, `ANTHROPIC_AWS_WORKSPACE_ID`, `GOOGLE_API_KEY`, `ADMIN_PASSWORD`, `RESEND_API_KEY`. |
| Images | Artifact Registry `kestrel` | `europe-north1-docker.pkg.dev/kestrel-contextdev/kestrel/web` |
| The film | Bucket `gs://kestrel-contextdev-media` | Public. The landing page plays the film from here. |
| Domain and HTTPS | Global load balancer | Address `kestrel-ip` (`136.81.31.251`), a Google-managed certificate `kestrel-cert` for `kestrel.zeroanomaly.tech`, and a redirect from http to https. |
| Account | `kestrel-run` | What the server runs as: it may read the secrets and reach the database, nothing else. |

## The one DNS record

At the registrar of `zeroanomaly.tech`:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `kestrel` | `136.81.31.251` | 300 (or the lowest offered) |

Once the record resolves, Google issues the certificate on its own, usually within 15 to 60 minutes. Until then `https://kestrel.zeroanomaly.tech` shows a certificate error and the service's own `run.app` address is the one to use. Check progress with:

```bash
gcloud compute ssl-certificates describe kestrel-cert --project kestrel-contextdev --global --format="value(managed.status,managed.domainStatus)"
```

## Deploying

By hand, from `web/`:

```bash
gcloud builds submit . --project kestrel-contextdev --region europe-north1 --tag europe-north1-docker.pkg.dev/kestrel-contextdev/kestrel/web:<tag>
gcloud run deploy kestrel --project kestrel-contextdev --region europe-north1 --image europe-north1-docker.pkg.dev/kestrel-contextdev/kestrel/web:<tag>
```

The second command only changes the image. The service keeps its settings. The server applies the database migrations in `web/drizzle/` when it starts.

**A deploy restarts the server. A chat or a watch that is running at that moment is lost**, and the demo shop page at `/dev/shop` goes back to its first price.

There is no deploy workflow on GitHub. `.github/workflows/ci.yml` runs the type check, the lint and the tests on every push; it needs no secrets.

## Watches and the webhook

- The clock that starts watches is inside the server, so they run only while the one instance is up.
- A watch with pinned pages or searches registers Context.dev monitors that call `https://kestrel.zeroanomaly.tech/api/hooks/context`. That address comes from `KESTREL_SITE_URL`; monitors are not registered when it is empty or points at localhost. The call is signed; the route verifies the signature before doing anything.
- Emails (notices, what a watch found) go out through Resend. The sender is on `beryl.zeroanomaly.tech`, the domain the team already verified there for its first project, under the name Kestrel. To send from Kestrel's own domain, verify `kestrel.zeroanomaly.tech` at Resend (three DNS records) and set `KESTREL_EMAIL_FROM`.

## Changing a setting

- A key: `printf %s "<value>" | gcloud secrets versions add <NAME> --project kestrel-contextdev --data-file=-`, then `gcloud run services update kestrel --project kestrel-contextdev --region europe-north1 --update-secrets <NAME>=<NAME>:latest`.
- The film: `gcloud storage cp <film>.mp4 gs://kestrel-contextdev-media/kestrel-demo.mp4 --project kestrel-contextdev`, then `gcloud run services update kestrel --project kestrel-contextdev --region europe-north1 --update-env-vars KESTREL_DEMO_VIDEO=https://storage.googleapis.com/kestrel-contextdev-media/kestrel-demo.mp4`. The still shown before play is in the image (`web/public/landing/demo-poster.jpg`): a new film needs a new poster and a deploy.

Each of these starts a new revision, so the same warning about running chats applies.

## Log

- **15 Nov, 03:37.** First deploy: revision `kestrel-00001-4c6`, image `web:live-1115-0332`, commit `8fd43ca`. Settings: `ADMIN_EMAIL=admin@kestrel.local`, `ADMIN_NAME=Admin`, `AWS_REGION=us-east-2`, and `KESTREL_SITE_URL` set to the service's own address, `https://kestrel-632134055337.europe-north1.run.app`, because the certificate for the domain is not active yet (the DNS record is not there). Checked signed out: `/api/health` says the database, both web-data keys, the models, voice, the admin and email are all set; the landing page, `/login` and `/dev/shop` answer 200; `/watches` sends a visitor to sign in; the API answers 401; the webhook refuses an unsigned call with 400.
- The admin password is the same secret value as Beryl's, copied project to project. Nobody has signed in on the live site from this setup.
- Checked from a local server against the live site: a watch pinned to the public demo shop page read `price: 329` and `inStock: true` off it through Oxylabs AI Parsing. Registering monitors was checked against Context.dev's API (page and search, semantic and exact: all accepted, each returning its signing secret). **Not yet seen: a delivery from a real monitor to the live webhook.** It needs a watch made on the live site by someone signed in.

## Still to do

- When `kestrel.zeroanomaly.tech` resolves and the certificate is active, point the site at it: `gcloud run services update kestrel --project kestrel-contextdev --region europe-north1 --update-env-vars KESTREL_SITE_URL=https://kestrel.zeroanomaly.tech`. Monitors registered before that keep calling the `run.app` address, which keeps working.
- The film: upload it to the bucket, set `KESTREL_DEMO_VIDEO`, add its poster and deploy.

## Shutting it down

Deleting the project removes everything. To keep the project but stop paying for the two things that cost money, delete the Cloud Run service and the Cloud SQL instance, and release the address `kestrel-ip`.
