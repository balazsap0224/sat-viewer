# Hosting: one-time setup (module 7)

The site is static files on **Cloudflare Pages** (SPEC.md 3). A GitHub Actions workflow
(`.github/workflows/deploy.yml`) runs the data job every 6 hours, builds the site and uploads
it to Cloudflare. It needs two secrets from the owner's Cloudflare account. Nothing else is
set up by hand: the workflow creates the Pages project `satviewer` on its first run.

Repository: https://github.com/balazsap0224/sat-viewer (private).

## 1. Cloudflare account

1. Go to https://dash.cloudflare.com/sign-up, sign up with email and password (the free
   plan; no card needed), and confirm the email.
2. Skip any "add a domain / website" prompts: Pages needs no domain.

## 2. API token (lets GitHub upload the site, nothing else)

1. In the Cloudflare dashboard, click the **profile icon** (top right) → **My Profile** →
   **API Tokens** (left menu).
2. **Create Token** → at the bottom, **Create Custom Token** → **Get started**.
3. **Token name:** `satviewer GitHub deploy`.
4. **Permissions:** one row: `Account` · `Cloudflare Pages` · `Edit`.
5. **Account Resources:** `Include` · your account.
6. Leave the rest (IP filtering, TTL) empty → **Continue to summary** → **Create Token**.
7. **Copy the token now**: Cloudflare shows it only once. (If lost: roll or delete it on
   the same page and make a new one.)

## 3. Account ID

Open https://dash.cloudflare.com: the address becomes `https://dash.cloudflare.com/<32 hex
characters>/home`. Those 32 characters are the Account ID. (It is also under **Workers &
Pages** → right-hand column → **Account ID**, with a copy button.)

The Account ID is not a secret, but it is stored next to the token for convenience.

## 4. Secrets in GitHub

1. Open the repository → **Settings** (top tab) → **Secrets and variables** → **Actions**.
2. **New repository secret** → Name `CLOUDFLARE_API_TOKEN`, Secret: the token → **Add
   secret**.
3. **New repository secret** → Name `CLOUDFLARE_ACCOUNT_ID`, Secret: the Account ID →
   **Add secret**.

The token never goes into the repository, a chat or a file (SPEC.md 10).

## 5. First deploy (after Claude pushes the code)

1. Repository → **Actions** → **Data and deploy** → **Run workflow** (or wait for the push
   to start it).
2. When it is green, the site is at **https://satviewer-8hx.pages.dev**. (`satviewer.pages.dev`
   belongs to someone else, so Cloudflare added the `-8hx` suffix.) The run's last step prints
   an address like `https://bb6fc5f5.satviewer-8hx.pages.dev`: that is the link to that one
   deploy, which never changes; the address without the first part always shows the newest.

## 6. Web Analytics (after the first deploy)

Cloudflare dashboard → **Workers & Pages** → **satviewer** → **Metrics** → **Web
Analytics** → **Enable**. Cookieless, so no consent banner (SPEC.md 10, 12).

## 7. Failure emails

GitHub emails the owner when a scheduled run fails (the data job stops on any HTTP error or
failed sanity check and keeps the previous site, SPEC.md 4.3). Check that it is on:
github.com → profile picture → **Settings** → **Notifications** → **Actions** → "Only
notify for failed workflows" ticked, email on.
