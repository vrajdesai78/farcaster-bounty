# Installable Farcaster client

The client remains a browser app connected to the operator’s own Snapchain node. The guide is a separate static site.

## Implemented

- Automatic initial account feed, connected-account Following feed, bounded rendering and pagination.
- Profile and cast conversation hash routes, parent navigation, paginated replies and a reply composer.
- Existing browser-signed casts, reactions, follows, app attribution filters and signer revocation retain merge confirmation. Successful publishing refreshes the current feed/conversation.
- Web manifest, 192/512 PNG icons, home-screen installation affordance, standalone display and iOS instructions.
- Network-only service worker with an offline connection-error screen. It creates no account/feed cache and stores no signing keys.

## Verification on 23 October 2026

24 protocol/gateway tests passed; production build passed. Installed Chrome was used because a Browser plugin was not available. Live reads used the existing node through the local gateway: automatic feed, a real cast and its reply, profile navigation, reply targeting and retained in-page draft passed. Layout was checked at 320, 390, 768 and 1440 pixels.

Manifest/icon loading, service-worker control, empty CacheStorage and offline navigation fallback passed. Chrome’s installability diagnostic reported only its automated incognito-context restriction. This does not prove installation on a physical phone.

## Limits

A manual iPhone/Android home-screen install and mobile-wallet round trip remain unverified. Installation does not inject a wallet provider; availability depends on the browser/wallet. Signing keys stay in memory and must be reconnected after reload/closing. No push-notification service or full-text search index is included. Following reads remain bounded per-account batches, not a complete network index.

An initial live authorization attempt received a gateway 502 on the custody-address lookup before any signer was submitted. Subsequent bounded reads on local and hosted gateways returned the expected FID. No fix or cause is claimed for that transient.

## Live signed actions on 23 October

After the transient lookup failure, the full hosted HTTPS run passed with disposable FID 3356280 and an automated local custody-signing bridge. Gasless authorization, cast/reply read-back, like/unlike, recast/undo, follow/unfollow, app include/exclude and self-revocation were verified against the real node. No browser page runtime errors occurred. Expected node NotFound responses occurred during key confirmation/revocation and absent-follow checks. The bridge does not establish manual mobile-wallet compatibility.

Public evidence:

- Cast: `0x342abebd705c11228cc5d8666bd53de3d8aa2571`
- Reply: `0x537fcf89e6f9ac43326922b14f8d10824af1396b`
- Key removal: `0x63add746593f17e6119e6ca08b4573da96d8730b`

The test key was revoked; reactions and the follow were reversed. Clearly labelled casts/replies remain public. No new EC2 instance or paid account registration was used. This remains separate from the incomplete fresh-server test.

## Public deployment security check — 23 October

The existing server was switched to explicit public-client mode. Anonymous HTTPS returned 200 with a real feed and no browser runtime errors. Private deployment paths and admin routes returned 404. Foreign-origin signed submissions returned 403; unsigned bytes sent to validation returned 400. No keys or social actions were created by these checks.

26 protocol/gateway tests passed, including public-mode restrictions and global request budgets. The gateway is bounded by per-IP/global rate limits, request/body/page/concurrency limits, and its existing non-root read-only container with dropped capabilities and CPU/memory caps.

For this existing deployment, public ingress to TCP3383 and a stale SSH source were removed. SSH is key-only from the current operator /32. Only HTTP80, HTTPS443 and Snapchain UDP3382 remain generally reachable. TCP3080,3381,3383,8126 and2019 were externally probed as unreachable. The adopted node’s HTTP/metrics sockets still listen on host interfaces but are blocked by its sole AWS security group; they were not rebound or restarted. Two-sample shard advancement/single-digit delays and a real cast read passed after the change.

Public access deliberately serves the app and approved public protocol queries. It does not confer shell access or access to the operator’s signing keys. These checks are bounded evidence, not a guarantee against vulnerabilities or denial of service.


## Account onboarding update — 23 October 2026

Connect account opens two paths: Use an existing account and Create a new account. Existing accounts are found from the custody wallet, without an FID input. Recovery-phrase import is opt-in: an English BIP-39 checksum is validated, the first Ethereum account is derived locally without an additional passphrase, and its custody authority registers a new gasless key. The phrase is not sent to the server, stored in browser storage or retained after leaving the import flow. Recovery phrases control wallet funds as well as the Farcaster identity.

New-account onboarding uses the user's connected wallet. It shows the OP Mainnet funding address, live IdGateway price (including initial allowance), balance and estimated OP network fees. Funding is external to the client; no bridge or on-ramp is operated here. An optional recovery wallet can be set; leaving it empty explicitly configures no recovery address. Price/fee/balance checks are refreshed before payment, and wallet/account/network checks precede signing. The wallet prompts for a paid registration transaction; no payment happens just by connecting or refreshing. New app-key authorization remains gasless.

Pending registration hashes and wallet addresses are public metadata persisted locally so a retry checks the pending transaction. Price increases, large fee changes, expired quotes, changed addresses and insufficient funding stop before payment. Successful registration waits for a receipt and reads the FID; own-node catch-up is still necessary before KEY_ADD. OP chain reads use https://mainnet.optimism.io; social reads and messages use the operator's Snapchain node.

Verification: 41 protocol/gateway/onboarding tests and the production build passed. Local installed-Chrome tests used mocked wallet/node/OP responses for existing-wallet detection, phrase import and authorization, no-phrase-upload/storage, insufficient funds, cost refresh, explicit approval, registration receipt then gasless signing, recovery-address changes, and 320/390/768/1440 layouts. A separate live, read-only OP contract check returned a registration price and fee estimate. No paid registration or public social action was sent in this update. A real user-wallet signup on a physical phone remains unverified. Earlier live signed-action evidence above describes the previous onboarding UI.

References: [IdGateway registration and price](https://docs.farcaster.xyz/reference/contracts/reference/id-gateway), [Snapchain gasless keys](https://snapchain.farcaster.xyz/guides/writing-messages).

## Node compatibility — 24 October 2026

The hosted client remains at https://relay.vrajdesai.dev/. Its Snapchain node was upgraded to 0.15.0, then passed two-sample sync and a real cast read. HTTPS health passed; the client services did not need a restart. See the [recovery record](NODE-RECOVERY.md). This infrastructure check does not establish physical-phone installation or rerun account/social actions.
