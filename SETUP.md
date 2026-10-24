# Run your own Farcaster node and client

This guide covers the same setup as the interactive tutorial in `site/`. See [verification status](docs/public/READINESS.md) for completed checks and remaining tests.

## Before starting

Use Terminal on macOS, a terminal app on Linux, or Ubuntu inside WSL2 on Windows. Install the tools in that environment. Paste one command at a time and press Enter; wait for it to finish before continuing. After cloning, `cd farcaster-bounty` moves into the project folder. Run every `./farcaster` command from that same folder. Keep its hidden `.relay-state` directory so you can resume and clean up the same server.

Start with reads: no Farcaster wallet is required to read a cast. GitHub access gets the code, AWS credentials manage the paid server, and the generated client login opens the hosted client. These are separate from Farcaster account authorization. The [interactive walkthrough](https://farcaster-client-sable.vercel.app/#prerequisites) includes tool checks and recovery steps.

## Prerequisites and costs

On your local macOS/Linux computer (or WSL2), install Python 3.9+, OpenSSH, Git or an archive extractor. On the AWS path, Node.js is only needed locally for the optional development mode; the hosted client builds inside its pinned container on EC2. For AWS, install AWS CLI 2.32.0+ and sign in with your own account credentials. Use `aws login` for a console account (IAM users/roles also need SignInLocalDevelopmentAccess). For IAM Identity Center, use `aws configure sso --profile default` followed by `aws sso login --profile default`. Use `us-east-1` and the default CLI profile for the commands as shown; the guide’s optional fields generate commands for a named profile or another region. Those cloud credentials are not third-party social API keys and are never copied to the server.

Use a dedicated Linux host with 4 vCPU, 16 GB RAM, a public IP and 2 TB SSD. The managed path uses Ubuntu 22.04, `m5.xlarge`, 2,000 GiB encrypted gp3, 3,000 IOPS and 125 MiB/s. Compute, provisioned storage, public IPv4, applicable transfer and taxes cost money. Check the [AWS calculator](https://calculator.aws/) for your region. By default, no automatic shutdown or deletion is installed. Stopping compute retains storage charges.

The AWS principal needs: `ec2:Describe*`, `ec2:ImportKeyPair`, `ec2:CreateSecurityGroup`, `ec2:AuthorizeSecurityGroupIngress`, `ec2:RunInstances`, `ec2:CreateTags`, and `ssm:GetParameter` for public Ubuntu image discovery. Explicit cleanup also needs `ec2:StopInstances`, `ec2:TerminateInstances`, `ec2:DeleteSecurityGroup`, `ec2:DeleteKeyPair`. Scope credentials to the intended account/region. Do not hardcode credentials or attach them to the server.

## Download and check the setup helper

`./farcaster` is a Python script in this repository, not a preinstalled command. These files are public and MIT licensed; you do not need a GitHub account, invitation or command-line GitHub login to download them. You do not need to create your own repository. In a terminal on your computer, check the required tools and AWS login:

```sh
git --version
python3 --version
ssh -V
aws --version
aws sts get-caller-identity
```

The first four commands print versions; the last identifies the AWS account that will pay for the server. Resolve missing tools or login errors before proceeding. Download the project into a new folder:

```sh
git clone https://github.com/vrajdesai78/farcaster-bounty.git
cd farcaster-bounty
./farcaster --help
```

`git clone` downloads the project, `cd` enters its folder, and `./farcaster --help` lists the helper's commands without creating resources. Expect output starting with `usage: relay`. If cloning fails, check the URL and your network connection. Use an existing clone only to resume its saved deployment. For a separate recording/new setup, use `git clone https://github.com/vrajdesai78/farcaster-bounty.git farcaster-node-demo` and `cd farcaster-node-demo` from your projects folder. That creates separate state and, if you provision, another paid server. Do not delete old deployment state. Run every later command there and keep `.relay-state` for retries and cleanup. The public source is available at https://github.com/vrajdesai78/farcaster-bounty under the MIT license.

## Continuous setup (recommended)

Use the guide’s command builder to fill in your IP and copy `./farcaster setup --ack-costs --ssh-cidr YOUR_IP/32`. It runs the three stages below, streams installation/build output, follows node logs and reports per-shard height/delay. No source/config files need editing. Snapshot restore can take hours; keep the terminal open to watch it. The CLI shows READY only after two advancing low-delay samples and a real cast read, then continues monitoring. `--once` exits after verification. Ctrl-C leaves AWS resources and hosted services running; their costs continue.

Resume from the same project folder with the same command. Healthy existing client services are kept running. `./farcaster watch` is a read-only live view for an existing deployment, with `--verbose` for full sanitized diagnostics and `--timeout 90` for a bounded run. Logs rotate at 2 MiB with one backup in `.relay-state/setup.log`; credentials and input payloads are not streamed. Retrieve the website login separately with `./farcaster client --credentials` in a private terminal.

For all-local setup, use `./farcaster setup --local` after the local prerequisites. This runs the node/client and monitoring in one terminal without AWS. Local logs rotate in `.relay-private/local-node/setup.log`. Exiting local setup (including `--once`) stops only its local client child; node containers remain running. `./farcaster watch --local` watches without starting/stopping either service. The individual commands are `./farcaster local prepare|start|client|status|logs|stop`.

The `farcaster_cli/` package holds the CLI; the `farcaster` file is its executable entry point. Legacy `./relay` commands still work. The stages below remain available separately.

## 1. Provision compute

In the [guide’s command builder](https://farcaster-client-sable.vercel.app/#commands), paste your public IPv4 from https://checkip.amazonaws.com/ and copy the generated command. No source/config changes are required. The snippet below is a template; the builder fills it without manually editing commands. A /32 restricts SSH to that address. Your account needs a default VPC/subnet in the chosen region, or an existing internet-routed subnet entered in the builder.

```sh
./farcaster provision --ack-costs --ssh-cidr YOUR_IP/32
```

Use `--region REGION`, `--profile PROFILE`, or `--subnet-id SUBNET` as needed. The default is `us-east-1`, AWS's configured principal and a default subnet. If there is no default subnet, supply an existing internet-routed subnet. The helper never creates a VPC/NAT gateway. `--ami` permits an explicit Ubuntu x86_64 AMI; otherwise a Canonical public SSM parameter resolves Ubuntu 22.04 at runtime and the selected AMI ID is saved.

Before paying, inspect the plan without making AWS calls:

```sh
./farcaster provision --ack-costs --ssh-cidr YOUR_IP/32 --dry-run
```

Created resources: one instance/root disk, SSH key pair and security group. HTTP/metrics bind to server loopback. Public peer ingress is UDP 3382 and TCP 3383; SSH is your /32. IMDSv2 is required. Detailed monitoring is not enabled. The private SSH key stays on your computer.

The hosted client step also opens public TCP 80 and 443 on a managed instance, after checking its ownership tag. Existing-host operators must allow those two ports themselves. The node HTTP API stays private.

State is written after each stage to `.relay-state/state.json` with mode 600; its directory is mode 700. A stable client token protects the instance launch from duplicates if a network failure interrupts the response. Keep the same state and rerun the same command to resume. Do not delete state as a retry strategy. On a partial failure, inspect recorded resources and the AWS console; you may still be paying for resources that were accepted before an interruption.

**Existing node alternative:** adopting the host creates no resources or software. The node step checks it; the client step installs the separate hosted client:

```sh
./farcaster provision --existing-host ubuntu@YOUR_SERVER --key ~/.ssh/id_ed25519
```

Default existing deployment directory is `/opt/snapchain`; use `--remote-dir /absolute/path` if needed. The key must already work for the host. Use a dedicated `RELAY_STATE_DIR` for another deployment. Do not point adoption at an empty host and expect installation; it is a non-mutating check of an already-running node.

## 2. Start Snapchain

```sh
./farcaster node
```

For a new managed host, the helper waits for SSH/cloud-init, installs Ubuntu's Docker packages if absent, uploads the bundled Compose and validators files, and starts only Snapchain and StatsD. These are dedicated-host instructions. There is no Grafana default-admin surface, host-wide Docker pruning, cron upgrade or scheduled shutdown.

Snapchain 0.15.0 is pinned to the registry manifest digest in `config/snapchain/compose.yml`. The config/validator source revision is recorded in `config/snapchain/SOURCE.md`. Future protocol upgrades require reviewing and updating the pins; this version is not promised to remain supported forever. The helper does not silently update a progressing restore. Updating your clone also does not replace an already-running node: review and apply node upgrades separately. Check official image tags and publication runs as well as GitHub releases; its latest-release endpoint can lag a published image.

For an adopted host, this command only reads `/v1/info`. It does not overwrite configuration, install packages or restart the node. If an existing node is restoring and its API resets, inspect its original logs and let progressing restoration continue.

New installs use `/opt/relay-snapchain`. Snapshot download, decompression, tar extraction and block catch-up can take hours. Observe bounded logs:

```sh
./farcaster logs
```

Never infer a stall just because tar extraction is quiet. Check actual progress/free disk before restarting. No full-sync ETA is guaranteed. On the all-local path, the client occupies its terminal. It prints an exact `cd` command for a second terminal; use that second terminal in the same project folder for local logs and status.

## 3. Deploy the hosted client

```sh
./farcaster client
```

This builds the browser client and installs a small production service beside Snapchain in `/opt/relay-client`. Caddy provides HTTPS and renews certificates. The installer starts only these client services; it leaves Snapchain and its database running. The browser signs social messages and sends them through HTTPS. The client service reaches the node at `127.0.0.1:3381` on the same server.

The command prints an HTTPS URL after checking it with normal certificate verification. Open that URL in a browser on your computer or phone. Choose **Install app** to add it to your home screen where supported; on iPhone/iPad use Safari → Share → Add to Home Screen. The installed client uses this same server and login. No local proxy, Node.js process or SSH tunnel needs to stay running. Signing keys remain in memory, so reconnect after closing/reloading the app. Installation does not add a mobile wallet provider.

A purchased domain is optional. By default the helper uses `relay-SERVER-IP.sslip.io`; sslip.io resolves the embedded public IP without DNS-account setup. It is a public DNS dependency, and certificate-authority availability/rate limits apply. The URL contains your public server IP. If that IP changes, the hostname and deployment configuration need updating. For a custom domain, point its A record directly to the server first (DNS proxy disabled), then run:

```sh
./farcaster client --domain client.example.com
```

The client is protected by a generated HTTP Basic login over HTTPS. It is separate from your wallet and never grants Farcaster signing permission. Login credentials are stored locally in mode-600 `.relay-state/hosted-access.json`; the server receives only a hash. The CLI prints only the private credentials file path during setup/build. It does not display the password automatically. To retrieve them later on your own terminal:

```sh
./farcaster client --credentials
```

Keep the login and this file private. The browser may retain its HTTP Basic session; close the private browser session after use on a shared device. The app signer still stays in browser memory and is forgotten on reload.

Managed AWS instances get inbound TCP 80/443 automatically. On existing hosts, allow those ports in the provider firewall yourself. Ports 80/443 must be free. Existing directories/services are not replaced unless the saved deployment owns `/opt/relay-client`. Caddy certificates persist in Docker volumes across client restarts. Container logs are bounded; reads, signed submissions, request bodies and upstream connections have explicit limits.

If HTTPS setup has not finished, the installer reports that it is unverified. Keep the saved state, check DNS/firewall and the client logs, then rerun the same command. Never bypass certificate errors or restart Snapchain to fix client hosting. From the project folder, run `./farcaster ssh` to open the saved host without editing key/host arguments. On that server, inspect:

```sh
sudo docker compose -p relay-client -f /opt/relay-client/compose.yml logs --tail 40
```

### Optional local development

Install Node.js 22.12+ or a newer supported LTS on your computer, then run:

```sh
./farcaster client --local
```

This keeps the original loopback client/proxy at `http://127.0.0.1:5173/` and an SSH tunnel on port 13381. Keep the terminal running. Choose different ports with `RELAY_TUNNEL_PORT=13382 PORT=5175 ./farcaster client --local` when needed. The setup helper refuses to replace an unrelated tunnel process. First SSH connections record the host key using accept-new; changed keys are rejected. Verify the initial fingerprint through a trusted channel.

`vite preview` alone does not provide a node connection. Vercel hosts the static guide, while the production client and node run on EC2. Do not expose the Vite development server publicly.

## Verify synchronization

```sh
./farcaster status --verify
```

Every reported shard must have single-digit `blockDelay`, positive advancing `maxHeight` in two samples 15 seconds apart, and a real query must return a cast. The helper writes `.relay-state/sync-evidence.json`. A running container, a completed download, or a single healthy sample is insufficient. `numShards` counts message shards; `shardInfos` also includes shard 0.

## Read, authorize and write

1. Read By FID (for example `3`) and inspect profiles/casts. Following assembles the latest 15 casts per account in bounded batches of 50 follow records; “Load more” includes another follow batch. It is chronological, not a complete ranked feed. Cast removal records can appear in API results and are not rendered as posts.
2. Use an existing disposable FID with active storage. Browser wallet must hold its custody account. The client checks that mapping and storage before registering a scoped Ed25519 app key. `KEY_ADD` needs two EIP-712 signatures, the current user nonce, permissions/scopes and TTL. This registration is gasless; new FID/storage purchase is separate.
3. Connect account now offers Use an existing account or Create a new account. Existing accounts are detected from the custody wallet, without typing an FID. An optional English BIP-39 recovery-phrase import derives the first Ethereum account (no additional passphrase) in the browser; it never uploads or persists the phrase. Both options register a new gasless app key; importing an old Ed25519 key and onchain signer registration are not offered. The phrase controls the wallet and its funds: only enter it into a site and device you trust.
4. Create a new account connects the user’s wallet, displays its funding address and live OP Mainnet registration price/balance, then estimates network fees after funding. The user reviews an optional recovery address and explicitly approves the paid IdGateway registration in the wallet. Registration includes the initial message allowance. No recovery address is configured if the optional field is empty; this is disclosed before approval. Price, wallet/network, fee and balance checks run again before submission. A pending transaction hash is retained locally (public metadata only) and checked before retrying. Wait for the OP receipt and node catch-up before authorizing the gasless app key. Public OP Mainnet RPC is used for chain reads; Farcaster data and signed social messages use the own node.
5. Post a labelled test cast, reply, like/recast and reverse the reactions, follow/unfollow a test target. The client sends signed protobuf bytes to your node, not custody secrets. A read node validates and gossips; validators commit; the node follows the block.
6. Success requires a matching merge event for social messages. The client captures message-shard cursors first, polls bounded pages and re-gossips identical bytes at most twice. A timeout remains pending. Keys are confirmed through signer state: matching registration nonce or present-before/absent-after revocation.
7. Apply Include only or Exclude using a requesting app FID. Unknown/removed attribution is omitted from either filtered set. A self-authorized key uses its own user's requestFid; do not call that a shared app identity.
8. Revoke network authorization before finishing, or allow inactivity expiry. Forget removes only the local in-memory key. Reload also forgets it. Imported keys retain existing scopes/expiry; new app keys use a 24-hour inactivity window.

Current node compatibility: shard 0 does not serve this message events API. Signer NotFound may be wrapped as HTTP 400, and requester nonce queries need literal `requesterFids[]=...` brackets. The client handles these actual tested shapes rather than guessing nonces or treating relay acceptance as inclusion. See [current documentation differences](docs/CURRENT-DOCS-REVIEW.md).

## Account message allowance

Storage rent pays for an FID’s network allowance. Casts, follows (links) and reactions have separate limits, shared across all clients used by that account. Storage purchases use the protocol’s contracts on OP Mainnet; this is separate from gasless app-key authorization and is not a gas fee per post.

Query `GET /v1/storageLimitsByFid?fid=YOUR_FID` on your node to inspect each message type’s `used` and `limit` values and the account’s storage-unit details. Spare cast allowance does not imply spare follow allowance. Check current pricing and any expiry terms before purchasing or renewing; avoid copying old quota tables. See the [Storage API reference](https://snapchain.farcaster.xyz/reference/httpapi/storagelimits).

## Optional new disposable account

The browser client can create an account through its funded-wallet signup flow; no CLI account helper is needed for the walkthrough. For automated disposable-account tests only, this separate helper can prepare/check a test custody wallet without exposing its secret:

```sh
cd client
npm run test-account -- status
```

It saves custody material in ignored `.snapchain-aws/test-account.json` with mode 600 and prints public OP Mainnet balance, FID and `IdGateway.price()` only. A new wallet starts unfunded. The registration quote includes initial storage; network fees are additional. Send ETH on **OP Mainnet (chain 10)**, not Ethereum mainnet, only after reviewing the current quote.

Explicit paid registration:

```sh
npm run test-account -- register --confirm-paid-registration
```

The helper refuses a registration value above 0.0001 ETH, simulates first and verifies a successful receipt/FID. That value cap excludes transaction fees. This disposable wallet has no separate recovery address: retain its private custody file. It does not automatically authorize an app signer or post. Never publish that file, paste it into chat, or fund it with assets unrelated to disposable testing.

## Cleanup

Revoke app keys first. Closing the setup terminal or browser leaves both hosted services and the node running. To stop only the client services, run on your server:

```sh
sudo docker compose -p relay-client -f /opt/relay-client/compose.yml stop
```

This leaves the node and all EC2/disk charges in place. In optional local mode, Ctrl-C stops the local client and this closes its tunnel:

```sh
./farcaster disconnect
```

Managed-server lifecycle commands first print a plan with no change:

```sh
./farcaster stop
./farcaster destroy
```

Repeating the chosen command with `--confirm INSTANCE_ID` explicitly authorizes it. The ownership tag must match local state. Stop retains disk charges. Destroy permanently terminates the instance and configured delete-on-termination root disk, waits for termination and deletes its recorded security group/key pair. The default VPC/subnet are never deleted. Inspect AWS for retained resources/snapshots and partial cleanup failures. No automatic shutdown, deletion, paid monitoring or host-wide pruning is installed.

Adopted hosts are never stopped/destroyed by the setup helper. The hosted client command installs separate client services on an adopted host; the node check remains read-only. Inspect and manage any OS shutdown schedule configured separately from this helper yourself. Private deployment instructions and histories are not part of the public source package.

## Evidence and remaining gates

Read [live client evidence](docs/LIVE-CLIENT-VERIFICATION.md) and [publication readiness](docs/public/READINESS.md). Own-node sync and mainnet client actions were verified 20 October 2026. A separate fresh-session test passed provisioning, node installation and HTTPS client deployment on a new AWS server on 21 October without installation fixes. Full sync and social actions on that server remain in progress. An independent human reproduction is still required. The exact bounty cutoff remains unverified. No endorsement or submission is fabricated.

## Optional disposable test deadline

For a new test server that must not be kept, add `--test-lifetime-hours 24` to the provision command (valid range: 1–48). This explicitly requests irreversible termination and deletion of the root disk at an absolute UTC deadline. It is off by default and refused for existing/adopted hosts. The launch supplies a cloud-init script installing `relay-test-expiry.timer` and sets EC2's instance-initiated shutdown behavior to `terminate`. The saved deadline is reused on a provisioning retry; it is not extended.

Before continuing installation, verify cloud-init completed, `sudo systemctl is-active relay-test-expiry.timer`, and `sudo systemctl list-timers relay-test-expiry.timer` on the new server. Independently check EC2's shutdown behavior is `terminate` and its root disk has `DeleteOnTermination=true`. If the timer is not armed, destroy the disposable deployment rather than leaving it unmonitored. This is a server-side safeguard, not a guarantee against OS/cloud failures.

Run normal ownership-checked `./farcaster destroy --confirm INSTANCE_ID` when testing finishes, even if the server has already terminated, to remove its recorded security group and key pair. Independently verify the instance, root volume, security group and key pair are gone. This option never changes an existing deployment or the default no-expiry setup.

## Optional public client

`./farcaster client --public` removes the website password gate. Anyone can read public Farcaster data through the configured gateway and submit messages signed by their own authorized account. The server never signs for visitors or shares the operator’s keys. `./farcaster client --private` restores the generated website login. The selected mode is saved and retained on later deployments.

Before opening a public client, inspect the host and security group: SSH should accept only your operator IP and require a key; raw HTTP/RPC/metrics ports should not be directly internet-accessible, or callers could bypass gateway limits. Keep only the required Snapchain peer connectivity. Public mode does not itself change an adopted host’s firewall. HTTP 80/443 serve the app, and Caddy’s admin API is disabled. The gateway runs on loopback as an unprivileged user with a read-only filesystem, dropped capabilities and CPU/memory limits. It exposes an allowlist, bounded pages/bodies/concurrency, per-IP and global request budgets, and node-side signature validation. These reduce exposure; they are not a guarantee against vulnerabilities or denial of service.

## All-local computer path (no AWS)

The guide now offers two hosting tabs. For both node and client on this computer, use `./farcaster local prepare`, then `start`, then `client`. See the README’s all-local requirements and the interactive guide for cloning, Docker capacity checks and expected outputs. APIs/metrics bind to loopback using `config/snapchain/local.yml`; UDP3382 remains the peer port. Data is retained in `.relay-private/local-node`. Use `status` for the two-sample/real-read check and `stop` to stop only the local project containers.

No AWS or SSH commands occur on this path. It is configuration/unit-tested; a fresh local full-sync and signed-write run has not been completed. Docker Desktop/WSL disk allocation and underlying physical capacity require operator checks. The existing `./farcaster client --local` option continues to mean local client plus remote node, not all-local hosting.
