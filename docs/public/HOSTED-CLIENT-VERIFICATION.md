# Hosted client verification

Verified 21 October 2026 using the existing Snapchain 0.14.3 node and disposable FID **3356280**. This is an existing-server deployment, not the still-pending fresh AWS installation test.

## What changed

`./relay client` now installs a compiled frontend, a small production API service and Caddy on the node host. Caddy manages HTTPS. The service connects to Snapchain over loopback. The browser keeps signing keys in memory. `./relay client --local` preserves the original development server and SSH tunnel.

The default free sslip.io hostname needs no purchased domain or DNS-account setup. A custom domain can be supplied with `--domain` after its A record points to the server. Login protects both the page and API; credentials are saved privately on the operator's computer and only a hash goes to the server.

## Live evidence

The installer completed a normal TLS-verified HTTPS health check. Browser reads, profiles, app include/exclude filters, node status and the signer dialog worked in installed Chrome at desktop and mobile widths. The client reports a same-server HTTPS connection.

Using an automated custody-wallet signing bridge, the browser performed these real mainnet actions through the hosted API:

| Action | Result |
| --- | --- |
| Gasless KEY_ADD | Registered and confirmed from signer state |
| Cast and reply | Merge confirmed and read back |
| Like/unlike, recast/undo | Added and removed; resulting state checked |
| Follow/unfollow FID 2 | Added and removed; resulting state checked |
| App filters | Included the active self-attributed casts; excluded them; clear restored the feed |
| Self-revocation | Key removed from network state and local session cleared |

Public message hashes:

- KEY_ADD: `0x1309bb3106de102eb806e54417282aa454e88ae9`
- Cast: `0xaac051eb4656eb1f2cd17fa65cab5bb8c4c876b3`
- Reply: `0x79c4b8e1e581df8d0f6b30cba01c8b5be381eb8b`
- KEY_REMOVE: `0xfe981b1543af3d4c7bfb170da2152ed46516817f`

Cast text: “Relay hosted-client test — disposable account. Posted over HTTPS to the client and Snapchain node on the same EC2. 21 October 2026.”

Reply text: “Relay hosted-client test reply. Same server, confirmed on our node. 21 October 2026.”

One initial authorization attempt hit a gateway timeout before any KEY_ADD was submitted. Bounded read-only account/storage/signer/event queries succeeded afterward, and the repeated full run passed. The transient was not assigned a cause or silently described as a fixed bug. Expected HTTP 400 NotFound responses occurred while awaiting signer inclusion, checking absent follows and looking up revoked signers; these were handled, with no application runtime crashes.

## Automated checks

- 21 client tests: 13 existing protocol checks plus eight hosted HTTP integration checks.
- 14 Python setup/package checks, including public-hostname validation, private-source exclusion, DNS targeting, firewall ownership and sync without a persistent tunnel.
- Production browser build and both Compose configurations validate.
- Anonymous hosted requests require authentication. Foreign origins, unknown routes, wrong methods/content types, oversized submissions and rate limits are covered by HTTP tests.
- Fonts are self-hosted; the final read suite had no unhandled browser errors or warnings. CSP remains enabled.

## Limits

The automated signing bridge generated real signatures but does not establish manual compatibility with every wallet extension or mobile wallet. Positive recovery-phrase testing remains simulated. Custom-domain setup and an actual changed-IP redeployment have not been live-tested. No fresh paid server was created, no independent-human endorsement obtained and no bounty reply submitted.

The server login, wallet secrets, deployment identifiers and private operations log are excluded from this record and the source package.
