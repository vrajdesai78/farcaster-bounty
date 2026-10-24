# Farcaster node and client

**Run your own Farcaster node and client.** Set up a Snapchain read node and host the Farcaster client on the same server. Read and post through your own node, without a third-party social API key.

The setup pins **Snapchain 0.15.0**. Our existing node passed sync verification and a real cast read on **24 October 2026 at 10:11 UTC (15:41 IST)** after upgrading from 0.14.3. This is a dated check, not a live status display. See the [recovery record](docs/public/NODE-RECOVERY.md) for the cause, measurements and upgrade limits.

## Continuous setup CLI

Clone the repo and use `./farcaster --help`. The CLI uses Python’s standard library; no pip dependencies or source/config edits are needed. In the [guide](https://farcaster-client-sable.vercel.app/#commands), enter your IP and copy the generated setup command:

```sh
./farcaster setup --ack-costs --ssh-cidr YOUR_IP/32
```

This runs provision → node → client → sync verification in one terminal. It streams installer/build output and readable node logs, shows per-shard height/delay, and keeps watching after readiness. `--verbose` includes full sanitized node diagnostics. Ctrl-C leaves hosted services running; rerun the same command to resume. Credentials are hidden during setup; retrieve them with `./farcaster client --credentials` privately. Logs rotate in `.relay-state/setup.log`.

For an existing deployment, `./farcaster watch` only follows logs and shard progress. `./farcaster watch --once --timeout 90` exits after verified sync or a timeout without changing the server. For both services on your computer, use `./farcaster setup --local`; Ctrl-C stops its local client but leaves the local node running. Local hardware requirements still apply.

The implementation is in `farcaster_cli/`. `python3 -m farcaster_cli` is also supported. `./relay` and `scripts/local-node.py` remain compatibility entry points for older instructions.

## Or run three stages separately

Use the [guide’s command builder](https://farcaster-client-sable.vercel.app/#commands) to enter your IP and copy the exact commands. The snippet below is a template; the builder fills it without source/config edits. Sign in to AWS and check the prerequisites in the guide first. Use a separate fresh clone for a new deployment; an existing folder resumes its recorded server.

After downloading/cloning this source and installing the [prerequisites](SETUP.md), run these from the repository root. Replace `YOUR_IP` with your current public IPv4 address.

```sh
./farcaster provision --ack-costs --ssh-cidr YOUR_IP/32
./farcaster node
./farcaster client
```

The AWS command provisions paid compute: one Ubuntu m5.xlarge and 2,000 GiB encrypted gp3 disk. It uses an existing VPC/subnet. Mainnet snapshot restore takes hours; the commands start the process, not instant sync. No shutdown is scheduled. Read the cost and cleanup sections before provisioning.

For an existing, already-running node instead:

```sh
./farcaster provision --existing-host ubuntu@YOUR_SERVER --key ~/.ssh/id_ed25519
./farcaster node
./farcaster client
```

The node step checks the adopted deployment without replacing or restarting it. The client step installs separate services in `/opt/relay-client`; allow TCP 80/443 on existing hosts. Lifecycle commands never stop or destroy an adopted server. The third command installs the HTTPS client beside your node and prints its URL. Retrieve the private website login with `./farcaster client --credentials`. No purchased domain or always-running local terminal is required. Each deployment's state and private keys stay in ignored `.relay-state/`. Rerun interrupted commands with that same state to resume.

## What works

- Real profile/cast reads, bounded chronological following feeds and pagination.
- Existing-account detection through a browser wallet, optional browser-only English recovery-phrase import, and new-account onboarding with OP Mainnet funding and explicit paid registration. Every account then uses a newly authorized gasless scoped app key.
- Casts/replies, likes/recasts and removal, follows/unfollows, app-FID include/exclude filters.
- Confirmation through message-shard events for social messages and signer-state reads for key changes.
- Session-only signing material, local forgetting, self-revocation, and rejection of inactive keys.

The original local client and real mainnet actions were verified on 20 October 2026. The hosted HTTPS client repeated the core flows on 21 October; see [hosted verification](docs/public/HOSTED-CLIENT-VERIFICATION.md). See [sanitized evidence](docs/LIVE-CLIENT-VERIFICATION.md) and [remaining verification limits](docs/public/READINESS.md). A separate fresh-session test passed all three commands on a new AWS server on 21 October, without installation fixes. That test server was deleted before full sync and social-action acceptance; the later retry was cancelled and cleaned up before installation. Fresh full-sync acceptance remains unverified.

## Guide and development

Read [SETUP.md](SETUP.md). Preview the static microsite locally:

```sh
python3 scripts/serve-site.py
```

Open **http://127.0.0.1:4173/**. The guide contains no wallet/key entry form and makes no social API calls. `site/` is a buildless static site; it can be hosted separately from the local client. The source is public and MIT licensed. Anyone can clone it without a GitHub account or invitation.

### Deploy the guide on Vercel

Import `vrajdesai78/farcaster-bounty` from GitHub and leave **Root Directory at the repository root (`.`)**. This differs from deploying the `site/` folder directly: the root `vercel.json` selects **Other**, skips installation/building, and publishes only `site/`. Leave dashboard build/output overrides disabled so the file applies. No environment variables are required. Click Deploy.

The public deployment contains only the tutorial and its assets. The production client service and Snapchain run on your EC2; wallet signing happens in the browser. Vercel does not run those services. `.vercelignore` excludes private state and generated source archives from uploads.

### Hosted client and local development

`./farcaster client` builds and hosts the Farcaster client on the same EC2 as Snapchain. Caddy manages HTTPS using a free IP-based sslip.io hostname, or your optional `--domain`. The generated login protects both the interface and API. Signing material stays in browser memory. See [the hosted-client instructions](SETUP.md#3-deploy-the-hosted-client) for credentials, network ports and certificate checks.

For development, `./farcaster client --local` retains the original local proxy and SSH tunnel at `http://127.0.0.1:5173/`. This optional mode needs local Node.js and a running terminal. A static upload of `client/dist` to Vercel supplies neither hosted backend nor local connection. Keep the guide project’s Root Directory at `.`.

After deployment, check the homepage, fonts/screenshots, chapter links and command copying at the returned HTTPS URL. The guide explains how to open the client URL printed by the installer. GitHub Pages remains an optional manual workflow.

Run checks:

```sh
python3 -m unittest discover -s tests -v
cd client
npm ci
npm test
npm run build
```

Node 22.12+ or a supported newer LTS; Python 3.9+; macOS/Linux or WSL2. AWS CLI v2 is needed only for managed AWS provisioning. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Cleanup and licenses

Closing the browser or setup terminal leaves the hosted client and node running. For optional local mode, Ctrl-C stops the local client, not the node. `./farcaster disconnect` closes its tunnel. `./farcaster stop` and `./farcaster destroy` first print plans; a matching instance ID via `--confirm` is required to act on a managed instance. Stopped EC2 retains disk charges. Destruction permanently deletes its configured root disk. Inspect AWS for retained resources afterward. Adopted servers are never managed by these commands.

Project code: [MIT](LICENSE). Bundled upstream Snapchain configuration and fonts retain their own licenses; see [NOTICE.md](NOTICE.md). No public endorsement, prize or completed submission is claimed.

## Install the client on your phone

Open the HTTPS client address printed by `./farcaster client`, sign in if the deployment requires a login, then choose **Install app**. On iPhone/iPad, open that address in Safari and choose **Share → Add to Home Screen**. The node stays on EC2; the installed app is its browser client. `./farcaster client --public` removes the website login; `--private` restores it. Keep raw node APIs restricted by the firewall when using public mode. Conversations and profiles have shareable hash routes. Drafts last for the current page session.

The service worker provides a connection-error screen without caching account data, authenticated pages, API responses or signing keys. Reconnect a signer after closing/reloading the app. Browser-wallet availability depends on the mobile browser or wallet; home-screen installation does not supply an Ethereum wallet. Real-device installation and wallet-extension support must be tested separately from automated browser checks.

## Run both services locally, without AWS

Use the guide’s **On your computer · No AWS** tab. The local path needs Linux x86_64 Docker, Compose 2.24.4+, at least 4 Docker CPUs, 16 GB Docker RAM and 2 TB free SSD space, plus Python 3.9+ and Node.js 22.12+. Check Docker Desktop/WSL VM allocation and physical free space separately. ARM/Apple Silicon and restrictive home-network operation are not validated by this path.

After cloning and entering the project folder:

```sh
./farcaster local prepare
./farcaster local start
./farcaster local client
```

Open http://127.0.0.1:5173/ on that computer. The local client talks directly to local port3381. No AWS account, AWS CLI or SSH tunnel is used. `./farcaster local status` checks two samples and a real read; `logs` inspects bounded logs, and `stop` stops the project containers while retaining data. Configuration/data stay in ignored `.relay-private/local-node`. The pinned node and local port overrides have been configuration-tested, not fully restored/synced on fresh local hardware.

This differs from `./farcaster client --local`, which remains a local client for a remote node. The AWS tab runs both node and client on AWS and provides the hosted HTTPS/PWA address.
