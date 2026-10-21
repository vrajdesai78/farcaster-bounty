# Run your own Farcaster node and Relay client

This public guide corresponds to the interactive tutorial in `site/`. It separates verified own-node client behavior from the new provisioner's still-pending clean-machine reproduction.

## Prerequisites and costs

On your local macOS/Linux computer (or WSL2), install Python 3.9+, OpenSSH, Node.js 22.12+ or a newer supported LTS, and Git or an archive extractor. For AWS, install/configure AWS CLI v2 with your own account credentials. Those cloud credentials are not third-party social API keys and are never copied to the server.

Use a dedicated Linux host with 4 vCPU, 16 GB RAM, a public IP and 2 TB SSD. The managed path uses Ubuntu 22.04, `m5.xlarge`, 2,000 GiB encrypted gp3, 3,000 IOPS and 125 MiB/s. Compute, provisioned storage, public IPv4, applicable transfer and taxes cost money. Check the [AWS calculator](https://calculator.aws/) for your region. No automatic shutdown or deletion is installed. Stopping compute retains storage charges.

The AWS principal needs: `ec2:Describe*`, `ec2:ImportKeyPair`, `ec2:CreateSecurityGroup`, `ec2:AuthorizeSecurityGroupIngress`, `ec2:RunInstances`, `ec2:CreateTags`, and `ssm:GetParameter` for public Ubuntu image discovery. Explicit cleanup also needs `ec2:StopInstances`, `ec2:TerminateInstances`, `ec2:DeleteSecurityGroup`, `ec2:DeleteKeyPair`. Scope credentials to the intended account/region. Do not hardcode credentials or attach them to the server.

Request access to the private repository, clone it, then open its root directory. The hosted guide does not offer a public source download. The three commands assume these prerequisites/source acquisition are complete.

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

State is written after each stage to `.relay-state/state.json` with mode 600; its directory is mode 700. A stable client token protects the instance launch from duplicates if a network failure interrupts the response. Keep the same state and rerun the same command to resume. Do not delete state as a retry strategy. On a partial failure, inspect recorded resources and the AWS console; you may still be paying for resources that were accepted before an interruption.

**Existing node alternative:** this does not create resources or install anything:

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

## 3. Launch the client

```sh
./relay client
```

The helper opens a local loopback SSH tunnel on port 13381, installs locked npm dependencies if needed, and runs the client/proxy on **http://127.0.0.1:5173/**. On first connection, OpenSSH records the server's host key using accept-new; a later changed host key is rejected. Verify the fingerprint through a trusted channel when first connecting.

The helper refuses an unmanaged process occupying its tunnel port. Stop your previous tunnel yourself, or choose another port through `RELAY_TUNNEL_PORT`; use `PORT` to change the local client port. Example: `RELAY_TUNNEL_PORT=13382 PORT=5175 ./relay client`. It does not kill unrelated processes. Keep this terminal running; Ctrl-C stops only the local client. Close the managed tunnel separately with `./relay disconnect`.

Production build check: `cd client && npm ci && npm test && npm run build`. `vite preview` alone does not provide the local proxy; use the normal local server for actual node access. Only the guide is a public static site. Do not expose the development server or secrets on a public website.

## Verify synchronization

```sh
./relay status --verify
```

Every reported shard must have single-digit `blockDelay`, positive advancing `maxHeight` in two samples 15 seconds apart, and a real query must return a cast. The helper writes `.relay-state/sync-evidence.json`. A running container, a completed download, or a single healthy sample is insufficient. `numShards` counts message shards; `shardInfos` also includes shard 0.

## Read, authorize and write

1. Read By FID (for example `3`) and inspect profiles/casts. Following assembles the latest 15 casts per account in bounded batches of 50 follow records; “Load more” includes another follow batch. It is chronological, not a complete ranked feed. Cast removal records can appear in API results and are not rendered as posts.
2. Use an existing disposable FID with active storage. Browser wallet must hold its custody account. Relay checks that mapping and storage before registering a scoped Ed25519 app key. `KEY_ADD` needs two EIP-712 signatures, the current user nonce, permissions/scopes and TTL. This registration is gasless; new FID/storage purchase is separate.
3. Existing signer imports a registered 32-byte Ed25519 app key. Test recovery derives the first Ethereum account from a disposable recovery phrase, entirely in the browser. Prefer a browser wallet. Never put a main-wallet phrase in the client or any phrase/key into the public tutorial.
4. Post a labelled test cast, reply, like/recast and reverse the reactions, follow/unfollow a test target. Relay sends signed protobuf bytes to your node, not custody secrets. A read node validates and gossips; validators commit; the node follows the block.
5. Success requires a matching merge event for social messages. Relay captures message-shard cursors first, polls bounded pages and re-gossips identical bytes at most twice. A timeout remains pending. Keys are confirmed through signer state: matching registration nonce or present-before/absent-after revocation.
6. Apply Include only or Exclude using a requesting app FID. Unknown/removed attribution is omitted from either filtered set. A self-authorized key uses its own user's requestFid; do not call that a shared Relay app identity.
7. Revoke network authorization before finishing, or allow inactivity expiry. Forget removes only the local in-memory key. Reload also forgets it. Imported keys retain existing scopes/expiry; new Relay keys use a 24-hour inactivity window.

Current node compatibility: shard 0 does not serve this message events API. Signer NotFound may be wrapped as HTTP 400, and requester nonce queries need literal `requesterFids[]=...` brackets. Relay handles these actual tested shapes rather than guessing nonces or treating relay acceptance as inclusion. See [current documentation differences](docs/CURRENT-DOCS-REVIEW.md).

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

Revoke app keys; Ctrl-C the local client; close its tunnel:

```sh
./relay disconnect
```

Managed-server lifecycle commands first print a plan with no change:

```sh
./relay stop
./relay destroy
```

Repeating the chosen command with `--confirm INSTANCE_ID` explicitly authorizes it. The ownership tag must match local state. Stop retains disk charges. Destroy permanently terminates the instance and configured delete-on-termination root disk, waits for termination and deletes its recorded security group/key pair. The default VPC/subnet are never deleted. Inspect AWS for retained resources/snapshots and partial cleanup failures. No automatic shutdown, deletion, paid monitoring or host-wide pruning is installed.

Adopted hosts are never stopped/destroyed by Relay. An OS shutdown previously configured outside Relay is outside this helper; inspect/manage it yourself. Private deployment instructions and histories are not part of the public source package.

## Evidence and remaining gates

Read [live client evidence](docs/LIVE-CLIENT-VERIFICATION.md) and [publication readiness](docs/public/READINESS.md). Own-node sync and mainnet client actions were verified 20 October 2026. AWS provisioning has mocked interruption/idempotence/lifecycle coverage, but a fresh paid deployment and independent human reproduction are still required before claiming the bounty is complete. The exact bounty cutoff remains unverified. No endorsement or submission is fabricated.
