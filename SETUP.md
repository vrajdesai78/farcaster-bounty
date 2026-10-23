# Run your own Farcaster node and client

This guide covers the same setup as the interactive tutorial in `site/`. See [verification status](docs/public/READINESS.md) for completed checks and remaining tests.

## First time using a terminal?

Use Terminal on macOS, a terminal app on Linux, or Ubuntu inside WSL2 on Windows. Install the tools in that environment. Paste one command at a time and press Enter; wait for it to finish before continuing. After cloning, `cd farcaster-bounty` moves into the project folder. Run every `./relay` command from that same folder. Keep its hidden `.relay-state` directory so you can resume and clean up the same server.

Start with reads: no Farcaster wallet is required to read a cast. GitHub access gets the code, AWS credentials manage the paid server, and the generated client login opens the hosted client. These are separate from Farcaster account authorization. The [interactive walkthrough](https://farcaster-client-sable.vercel.app/#prerequisites) includes tool checks and recovery steps.

## Prerequisites and costs

On your local macOS/Linux computer (or WSL2), install Python 3.9+, OpenSSH, Git or an archive extractor. Node.js is only needed locally for the optional development mode; the hosted client builds inside its pinned container on EC2. For AWS, install/configure AWS CLI v2 with your own account credentials. Those cloud credentials are not third-party social API keys and are never copied to the server.

Use a dedicated Linux host with 4 vCPU, 16 GB RAM, a public IP and 2 TB SSD. The managed path uses Ubuntu 22.04, `m5.xlarge`, 2,000 GiB encrypted gp3, 3,000 IOPS and 125 MiB/s. Compute, provisioned storage, public IPv4, applicable transfer and taxes cost money. Check the [AWS calculator](https://calculator.aws/) for your region. By default, no automatic shutdown or deletion is installed. Stopping compute retains storage charges.

The AWS principal needs: `ec2:Describe*`, `ec2:ImportKeyPair`, `ec2:CreateSecurityGroup`, `ec2:AuthorizeSecurityGroupIngress`, `ec2:RunInstances`, `ec2:CreateTags`, and `ssm:GetParameter` for public Ubuntu image discovery. Explicit cleanup also needs `ec2:StopInstances`, `ec2:TerminateInstances`, `ec2:DeleteSecurityGroup`, `ec2:DeleteKeyPair`. Scope credentials to the intended account/region. Do not hardcode credentials or attach them to the server.

## Download and check the setup helper

`./relay` is a Python script in this repository, not a preinstalled command. A repository is the collection of project files hosted on GitHub. These files are public and MIT licensed; you do not need a GitHub account, invitation or command-line GitHub login to download them. You do not need to create your own repository. In a terminal on your computer, check the required tools and AWS login:

```sh
git --version
python3 --version
ssh -V
aws --version
aws sts get-caller-identity
```

The first four commands print versions; the last identifies the AWS account that will pay for the server. Resolve missing tools or login errors before proceeding. Download the project:

```sh
git clone https://github.com/vrajdesai78/farcaster-bounty.git
cd farcaster-bounty
./relay --help
```

`git clone` downloads the project, `cd` enters its folder, and `./relay --help` lists the helper's commands without creating resources. Expect output starting with `usage: relay`. If cloning fails, check the URL and your network connection. If you already cloned it, use that existing folder. Run every later command there and keep `.relay-state` for retries and cleanup. The public source is available at https://github.com/vrajdesai78/farcaster-bounty under the MIT license.

## 1. Provision compute

Replace `YOUR_IP` with your current public IPv4 (for example, discover it through your router or cloud console). A /32 restricts SSH to that address.

```sh
./relay provision --ack-costs --ssh-cidr YOUR_IP/32
```

Use `--region REGION`, `--profile PROFILE`, or `--subnet-id SUBNET` as needed. The default is `us-east-1`, AWS's configured principal and a default subnet. If there is no default subnet, supply an existing internet-routed subnet. The helper never creates a VPC/NAT gateway. `--ami` permits an explicit Ubuntu x86_64 AMI; otherwise a Canonical public SSM parameter resolves Ubuntu 22.04 at runtime and the selected AMI ID is saved.

Before paying, inspect the plan without making AWS calls:

```sh
./relay provision --ack-costs --ssh-cidr YOUR_IP/32 --dry-run
```

Created resources: one instance/root disk, SSH key pair and security group. HTTP/metrics bind to server loopback. Public peer ingress is UDP 3382 and TCP 3383; SSH is your /32. IMDSv2 is required. Detailed monitoring is not enabled. The private SSH key stays on your computer.

The hosted client step also opens public TCP 80 and 443 on a managed instance, after checking its ownership tag. Existing-host operators must allow those two ports themselves. The node HTTP API stays private.

State is written after each stage to `.relay-state/state.json` with mode 600; its directory is mode 700. A stable client token protects the instance launch from duplicates if a network failure interrupts the response. Keep the same state and rerun the same command to resume. Do not delete state as a retry strategy. On a partial failure, inspect recorded resources and the AWS console; you may still be paying for resources that were accepted before an interruption.

**Existing node alternative:** adopting the host creates no resources or software. The node step checks it; the client step installs the separate hosted client:

```sh
./relay provision --existing-host ubuntu@YOUR_SERVER --key ~/.ssh/id_ed25519
```

Default existing deployment directory is `/opt/snapchain`; use `--remote-dir /absolute/path` if needed. The key must already work for the host. Use a dedicated `RELAY_STATE_DIR` for another deployment. Do not point adoption at an empty host and expect installation; it is a non-mutating check of an already-running node.

## 2. Start Snapchain

```sh
./relay node
```

For a new managed host, the helper waits for SSH/cloud-init, installs Ubuntu's Docker packages if absent, uploads the bundled Compose and validators files, and starts only Snapchain and StatsD. These are dedicated-host instructions. There is no Grafana default-admin surface, host-wide Docker pruning, cron upgrade or scheduled shutdown.

Snapchain 0.14.3 is pinned to the registry manifest digest in `config/snapchain/compose.yml`. The config/validator source revision is recorded in `config/snapchain/SOURCE.md`. Future protocol upgrades require reviewing and updating the pins; this version is not promised to remain supported forever. The helper does not silently update a progressing restore.

For an adopted host, this command only reads `/v1/info`. It does not overwrite configuration, install packages or restart the node. If an existing node is restoring and its API resets, inspect its original logs and let progressing restoration continue.

New installs use `/opt/relay-snapchain`. Snapshot download, decompression, tar extraction and block catch-up can take hours. Observe bounded logs:

```sh
./relay logs
```

Never infer a stall just because tar extraction is quiet. Check actual progress/free disk before restarting. No full-sync ETA is guaranteed.

## 3. Deploy the hosted client

```sh
./relay client
```

This builds the browser client and installs a small production service beside Snapchain in `/opt/relay-client`. Caddy provides HTTPS and renews certificates. The installer starts only these client services; it leaves Snapchain and its database running. The browser signs social messages and sends them through HTTPS. The client service reaches the node at `127.0.0.1:3381` on the same server.

The command prints an HTTPS URL after checking it with normal certificate verification. Open that URL in a browser on your computer or phone. Choose **Install app** to add it to your home screen where supported; on iPhone/iPad use Safari → Share → Add to Home Screen. The installed client uses this same server and login. No local proxy, Node.js process or SSH tunnel needs to stay running. Signing keys remain in memory, so reconnect after closing/reloading the app. Installation does not add a mobile wallet provider.

A purchased domain is optional. By default the helper uses `relay-SERVER-IP.sslip.io`; sslip.io resolves the embedded public IP without DNS-account setup. It is a public DNS dependency, and certificate-authority availability/rate limits apply. The URL contains your public server IP. If that IP changes, the hostname and deployment configuration need updating. For a custom domain, point its A record directly to the server first (DNS proxy disabled), then run:

```sh
./relay client --domain client.example.com
```

The client is protected by a generated HTTP Basic login over HTTPS. It is separate from your wallet and never grants Farcaster signing permission. Login credentials are stored locally in mode-600 `.relay-state/hosted-access.json`; the server receives only a hash. The installer displays them automatically in an interactive terminal. When output is captured or redirected, it prints only the private file path. To retrieve them later on your own terminal:

```sh
./relay client --credentials
```

Keep the login and this file private. The browser may retain its HTTP Basic session; close the private browser session after use on a shared device. The app signer still stays in browser memory and is forgotten on reload.

Managed AWS instances get inbound TCP 80/443 automatically. On existing hosts, allow those ports in the provider firewall yourself. Ports 80/443 must be free. Existing directories/services are not replaced unless the saved deployment owns `/opt/relay-client`. Caddy certificates persist in Docker volumes across client restarts. Container logs are bounded; reads, signed submissions, request bodies and upstream connections have explicit limits.

If HTTPS setup has not finished, the installer reports that it is unverified. Keep the saved state, check DNS/firewall and the client logs, then rerun the same command. Never bypass certificate errors or restart Snapchain to fix client hosting. On the server, inspect:

```sh
sudo docker compose -p relay-client -f /opt/relay-client/compose.yml logs --tail 40
```

### Optional local development

Install Node.js 22.12+ or a newer supported LTS on your computer, then run:

```sh
./relay client --local
```

This keeps the original loopback client/proxy at `http://127.0.0.1:5173/` and an SSH tunnel on port 13381. Keep the terminal running. Choose different ports with `RELAY_TUNNEL_PORT=13382 PORT=5175 ./relay client --local` when needed. The setup helper refuses to replace an unrelated tunnel process. First SSH connections record the host key using accept-new; changed keys are rejected. Verify the initial fingerprint through a trusted channel.

`vite preview` alone does not provide a node connection. Vercel hosts the static guide, while the production client and node run on EC2. Do not expose the Vite development server publicly.

## Verify synchronization

```sh
./relay status --verify
```

Every reported shard must have single-digit `blockDelay`, positive advancing `maxHeight` in two samples 15 seconds apart, and a real query must return a cast. The helper writes `.relay-state/sync-evidence.json`. A running container, a completed download, or a single healthy sample is insufficient. `numShards` counts message shards; `shardInfos` also includes shard 0.

## Read, authorize and write

1. Read By FID (for example `3`) and inspect profiles/casts. Following assembles the latest 15 casts per account in bounded batches of 50 follow records; “Load more” includes another follow batch. It is chronological, not a complete ranked feed. Cast removal records can appear in API results and are not rendered as posts.
2. Use an existing disposable FID with active storage. Browser wallet must hold its custody account. The client checks that mapping and storage before registering a scoped Ed25519 app key. `KEY_ADD` needs two EIP-712 signatures, the current user nonce, permissions/scopes and TTL. This registration is gasless; new FID/storage purchase is separate.
3. Existing signer imports a registered 32-byte Ed25519 app key. Test recovery derives the first Ethereum account from a disposable recovery phrase, entirely in the browser. Prefer delegated app-key authorization through a browser wallet. Enter a recovery phrase only into software from developers you trust, after checking its code and the site you are using. Anyone with the phrase can control its wallet and funds. Use only a disposable test account; never put a main-wallet phrase in the client or any phrase/key into the public tutorial.
4. Post a labelled test cast, reply, like/recast and reverse the reactions, follow/unfollow a test target. The client sends signed protobuf bytes to your node, not custody secrets. A read node validates and gossips; validators commit; the node follows the block.
5. Success requires a matching merge event for social messages. The client captures message-shard cursors first, polls bounded pages and re-gossips identical bytes at most twice. A timeout remains pending. Keys are confirmed through signer state: matching registration nonce or present-before/absent-after revocation.
6. Apply Include only or Exclude using a requesting app FID. Unknown/removed attribution is omitted from either filtered set. A self-authorized key uses its own user's requestFid; do not call that a shared app identity.
7. Revoke network authorization before finishing, or allow inactivity expiry. Forget removes only the local in-memory key. Reload also forgets it. Imported keys retain existing scopes/expiry; new app keys use a 24-hour inactivity window.

Current node compatibility: shard 0 does not serve this message events API. Signer NotFound may be wrapped as HTTP 400, and requester nonce queries need literal `requesterFids[]=...` brackets. The client handles these actual tested shapes rather than guessing nonces or treating relay acceptance as inclusion. See [current documentation differences](docs/CURRENT-DOCS-REVIEW.md).

## Account storage and server storage

Storage rent pays for an FID’s network allowance. Casts, follows (links) and reactions have separate limits, shared across all clients used by that account. Renting a larger AWS disk does not increase those limits. Storage purchases use the protocol’s contracts on OP Mainnet; this is separate from gasless app-key authorization and is not a gas fee per post.

Query `GET /v1/storageLimitsByFid?fid=YOUR_FID` on your node to inspect each message type’s `used` and `limit` values and the account’s storage-unit details. Spare cast allowance does not imply spare follow allowance. Check current pricing and any expiry terms before purchasing or renewing; avoid copying old quota tables. See the [Storage API reference](https://snapchain.farcaster.xyz/reference/httpapi/storagelimits).

## Optional new disposable account

The client authorizes an existing FID. A separate helper can prepare/check a test custody wallet without exposing its secret:

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
./relay disconnect
```

Managed-server lifecycle commands first print a plan with no change:

```sh
./relay stop
./relay destroy
```

Repeating the chosen command with `--confirm INSTANCE_ID` explicitly authorizes it. The ownership tag must match local state. Stop retains disk charges. Destroy permanently terminates the instance and configured delete-on-termination root disk, waits for termination and deletes its recorded security group/key pair. The default VPC/subnet are never deleted. Inspect AWS for retained resources/snapshots and partial cleanup failures. No automatic shutdown, deletion, paid monitoring or host-wide pruning is installed.

Adopted hosts are never stopped/destroyed by the setup helper. The hosted client command installs separate client services on an adopted host; the node check remains read-only. Inspect and manage any OS shutdown schedule configured separately from this helper yourself. Private deployment instructions and histories are not part of the public source package.

## Evidence and remaining gates

Read [live client evidence](docs/LIVE-CLIENT-VERIFICATION.md) and [publication readiness](docs/public/READINESS.md). Own-node sync and mainnet client actions were verified 20 October 2026. A separate fresh-session test passed provisioning, node installation and HTTPS client deployment on a new AWS server on 21 October without installation fixes. Full sync and social actions on that server remain in progress. An independent human reproduction is still required. The exact bounty cutoff remains unverified. No endorsement or submission is fabricated.

## Optional disposable test deadline

For a new test server that must not be kept, add `--test-lifetime-hours 24` to the provision command (valid range: 1–48). This explicitly requests irreversible termination and deletion of the root disk at an absolute UTC deadline. It is off by default and refused for existing/adopted hosts. The launch supplies a cloud-init script installing `relay-test-expiry.timer` and sets EC2's instance-initiated shutdown behavior to `terminate`. The saved deadline is reused on a provisioning retry; it is not extended.

Before continuing installation, verify cloud-init completed, `sudo systemctl is-active relay-test-expiry.timer`, and `sudo systemctl list-timers relay-test-expiry.timer` on the new server. Independently check EC2's shutdown behavior is `terminate` and its root disk has `DeleteOnTermination=true`. If the timer is not armed, destroy the disposable deployment rather than leaving it unmonitored. This is a server-side safeguard, not a guarantee against OS/cloud failures.

Run normal ownership-checked `./relay destroy --confirm INSTANCE_ID` when testing finishes, even if the server has already terminated, to remove its recorded security group and key pair. Independently verify the instance, root volume, security group and key pair are gone. This option never changes an existing deployment or the default no-expiry setup.
