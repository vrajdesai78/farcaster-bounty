# Relay

**Your node. Your feed.** A Farcaster client and practical guide for running your own Snapchain read node, without a third-party social API key.

## Start with three commands

After downloading/cloning this source and installing the [prerequisites](SETUP.md), run these from the repository root. Replace `YOUR_IP` with your current public IPv4 address.

```sh
./relay provision --ack-costs --ssh-cidr YOUR_IP/32
./relay node
./relay client
```

The AWS command provisions paid compute: one Ubuntu m5.xlarge and 2,000 GiB encrypted gp3 disk. It uses an existing VPC/subnet. Mainnet snapshot restore takes hours; the commands start the process, not instant sync. No shutdown is scheduled. Read the cost and cleanup sections before provisioning.

For an existing, already-running node instead:

```sh
./relay provision --existing-host ubuntu@YOUR_SERVER --key ~/.ssh/id_ed25519
./relay node
./relay client
```

The node step checks the adopted deployment without replacing or restarting it. The client step installs separate services in `/opt/relay-client`; allow TCP 80/443 on existing hosts. Lifecycle commands never stop or destroy an adopted server. The third command installs the HTTPS client beside your node and prints its URL. Use the generated login displayed in your interactive terminal, or retrieve it later with `./relay client --credentials`. No purchased domain or always-running local terminal is required. Each deployment's state and private keys stay in ignored `.relay-state/`. Rerun interrupted commands with that same state to resume.

## What works

- Real profile/cast reads, bounded chronological following feeds and pagination.
- Gasless scoped signer registration; browser-wallet, existing Ed25519 signer and disposable test-recovery paths.
- Casts/replies, likes/recasts and removal, follows/unfollows, app-FID include/exclude filters.
- Confirmation through message-shard events for social messages and signer-state reads for key changes.
- Session-only signing material, local forgetting, self-revocation, and rejection of inactive keys.

The original local client and real mainnet actions were verified on 20 October 2026. The hosted HTTPS client repeated the core flows on 21 October; see [hosted verification](docs/public/HOSTED-CLIENT-VERIFICATION.md). See [sanitized evidence](docs/LIVE-CLIENT-VERIFICATION.md) and [remaining verification limits](docs/public/READINESS.md). The new AWS provisioner has mocked acceptance coverage, not a fresh paid clean-machine reproduction. This is not a completed bounty submission.

## Guide and development

Read [SETUP.md](SETUP.md). Preview the static microsite locally:

```sh
python3 scripts/serve-site.py
```

Open **http://127.0.0.1:4173/**. The guide contains no wallet/key entry form and makes no social API calls. `site/` is a buildless static site; it can be hosted separately from the local client. The repository is private; the hosted guide offers no source-code download. Collaborators need repository access to run the setup.

### Deploy the guide on Vercel

Import `vrajdesai78/farcaster-bounty` from GitHub and leave **Root Directory at the repository root (`.`)**. This differs from deploying the `site/` folder directly: the root `vercel.json` selects **Other**, skips installation/building, and publishes only `site/`. Leave dashboard build/output overrides disabled so the file applies. No environment variables are required. Click Deploy.

The public deployment contains only the tutorial and its assets. The production client service and Snapchain run on your EC2; wallet signing happens in the browser. Vercel does not run those services. `.vercelignore` excludes private state and generated source archives from uploads.

### Hosted client and local development

`./relay client` builds and hosts Relay on the same EC2 as Snapchain. Caddy manages HTTPS using a free IP-based sslip.io hostname, or your optional `--domain`. The generated login protects both the interface and API. Signing material stays in browser memory. See [the hosted-client instructions](SETUP.md#3-deploy-the-hosted-client) for credentials, network ports and certificate checks.

For development, `./relay client --local` retains the original local proxy and SSH tunnel at `http://127.0.0.1:5173/`. This optional mode needs local Node.js and a running terminal. A static upload of `client/dist` to Vercel supplies neither hosted backend nor local connection. Keep the guide project’s Root Directory at `.`.

After deployment, check the homepage, fonts/screenshots, chapter links and command copying at the returned HTTPS URL. The guide explains how to open the client URL printed by the installer. GitHub Pages remains an optional manual workflow, but the current GitHub plan does not support Pages for this private repository.

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

Closing the browser or setup terminal leaves the hosted client and node running. For optional local mode, Ctrl-C stops the local client, not the node. `./relay disconnect` closes its tunnel. `./relay stop` and `./relay destroy` first print plans; a matching instance ID via `--confirm` is required to act on a managed instance. Stopped EC2 retains disk charges. Destruction permanently deletes its configured root disk. Inspect AWS for retained resources afterward. Adopted servers are never managed by these commands.

Project code: [MIT](LICENSE). Bundled upstream Snapchain configuration and fonts retain their own licenses; see [NOTICE.md](NOTICE.md). No public endorsement, prize or completed submission is claimed.
