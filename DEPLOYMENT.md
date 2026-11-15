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
| Domain and HTTPS | Global load balancer | Address `kestrel-ip` (`136.81.31.251`), two Google-managed certificates for `kestrel.zeroanomaly.tech` on the proxy `kestrel-https` (`kestrel-cert` and `kestrel-cert-2`, see below), and a redirect from http to https. |
| Account | `kestrel-run` | What the server runs as: it may read the secrets and reach the database, nothing else. |

## The one DNS record

At the registrar of `zeroanomaly.tech`:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `kestrel` | `136.81.31.251` | 300 (or the lowest offered) |

The record was added on 15 Nov at about 06:10 and resolved at once on the zone's four name servers and on the public resolvers.

Once the record resolves, Google issues the certificate on its own, usually within 15 to 60 minutes. Until then `https://kestrel.zeroanomaly.tech` refuses the connection and the service's own `run.app` address is the one to use. Check progress with:

```bash
gcloud compute ssl-certificates list --project kestrel-contextdev --global --format="value(name,managed.status,managed.domainStatus)"
```

A certificate made before its record exists can get stuck. `kestrel-cert` was made at 02:42, three and a half hours before the record, and still said `FAILED_NOT_VISIBLE` after the record resolved. A second one made after the record starts its checks at once, and the proxy can carry both:

```bash
gcloud compute ssl-certificates create kestrel-cert-2 --project kestrel-contextdev --global --domains kestrel.zeroanomaly.tech
gcloud compute target-https-proxies update kestrel-https --project kestrel-contextdev --global --ssl-certificates kestrel-cert,kestrel-cert-2
```

Neither command restarts the server.

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

- **15 Nov, 04:20.** Second deploy: revision `kestrel-00002-d4s`, image `web:live-1115-0418`, commit `55196a8`. It carries the Sift fix for slow page reads, the clean-up, and the film: `kestrel-draft-2.mp4` is in the bucket as `kestrel-demo.mp4` and `KESTREL_DEMO_VIDEO` points at it. Before it went out the service's log showed no one signed in and no chat running for 45 minutes. Checked signed out afterwards: `/api/health` all set; `/`, `/login`, `/dev/shop` and the film's poster answer 200; `/watches` sends a visitor to sign in; the API answers 401; the webhook refuses an unsigned call with 400; the film plays on the landing page.
- **15 Nov, 04:49.** Third deploy: revision `kestrel-00003-9j7`, image `web:live-1115-0505` (built at 04:42), commit `6bea118`. It carries the price picker's fixes for countries outside the euro. The service's log showed no one signed in before it went out. The same checks as above passed afterwards. Before the build, on this computer: the type check, the lint, `test:diff`, `test:offers` (38), `test:guard` (41), `test:watch` (all passed), and real questions through the app (prices in eight countries, a sift of 40 pages).

- **15 Nov, 06:19.** The site's address is the domain: `KESTREL_SITE_URL=https://kestrel.zeroanomaly.tech`, revision `kestrel-00004-pst`, the same image (`web:live-1115-0505`). Asadullah said to restart; the log showed nobody signed in. From here on a watch's monitors call the webhook on the domain, and links in emails point there. The same signed-out checks passed afterwards on the `run.app` address, which keeps working. At 06:20 the certificate was still being issued (`kestrel-cert-2`, made at 06:12), so the domain itself did not answer over https yet.
- **15 Nov, 06:52.** The domain answers. `kestrel-cert-2` went `ACTIVE` at 06:51, 39 minutes after it was made, and `https://kestrel.zeroanomaly.tech` answered a minute later. Checked signed out, on the domain: `/api/health` all set; `/`, `/login`, `/dev/shop` and the film's poster answer 200; `/watches` sends a visitor to sign in; the API answers 401; the webhook refuses an unsigned call with 400; http redirects to https. A watch made on the live site now registers monitors that call the domain.

## Still to do

- A delivery from a real monitor to the live webhook has still not been seen. Sign in, make a watch on `/dev/shop`, change the price at `/dev/shop-admin`, and wait for the monitor's next look (up to ten minutes) or press "Check now".

## Shutting it down

Deleting the project removes everything. To keep the project but stop paying for the two things that cost money, delete the Cloud Run service and the Cloud SQL instance, and release the address `kestrel-ip`.
