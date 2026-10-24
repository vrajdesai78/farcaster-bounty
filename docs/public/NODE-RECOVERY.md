# Snapchain sync recovery — 24 October 2026

Our existing node passed sync and read verification at **10:11:39 UTC (15:41:39 IST)** after upgrading to **Snapchain 0.15.0**. The client remains at [relay.vrajdesai.dev](https://relay.vrajdesai.dev/). These are dated measurements, not a live status service.

## What failed

Shard 1 stopped at height `49477354` while shards 0 and 2 kept advancing. The node's HTTP API still responded, so a running container and a reachable API did not establish sync.

`./farcaster status --verify` failed. Shard 1 was over four hours behind. Disk usage was 30%, about 13.6 GiB of RAM was available, and Docker reported no OOM kill. The validator file matched the official release.

Repeated pending block requests and `Messaging(SendErr)` were symptoms. Restarting only Snapchain exposed the earlier failure at the same next block:

```text
Error validating user message: MessageValidationError(ProUserFeature)
Account root mismatch
State change commit failed: merkle trie root hash mismatch
```

The old `0.14.3` binary rejected a non-Pro account's banner. Validators had accepted it under the updated network rules. Rejecting that message produced a different state root, and the node correctly refused to commit it. Its shard worker then failed.

## What fixed it

Upstream [PR #1054](https://github.com/farcasterxyz/snapchain/pull/1054) opens banners and 10,000-byte casts to accounts without Pro at a scheduled protocol boundary. The official [v0.15.0 tag](https://github.com/farcasterxyz/snapchain/tree/v0.15.0) contains that change. Its [image publication run](https://github.com/farcasterxyz/snapchain/actions/runs/39939406163) succeeded on 23 October.

We pulled and pinned this official image:

```text
farcasterxyz/snapchain@sha256:328012d7814db9f5c2f4357a01fc1c3e92f4bed90db30855c9fc356316bb669f
```

Source commit: `83c75b4f5f1c57b8fb6ab72d06eba48c26c4fbba`. The running node reported version `0.15.0`. The validator file was unchanged between the two releases.

We backed up the server's Compose file, changed only the node image, validated the configuration and recreated only the Snapchain service. Its existing database replayed the formerly failing block and caught up. The client and Caddy containers kept running. No database was deleted, state-root check bypassed, or new cloud resource created. Instance size, disk performance, firewall and the operator-controlled shutdown policy stayed unchanged.

## Verification

`./farcaster watch --once` completed the same check that failed before the upgrade:

| Shard | First height | Second height | First delay | Second delay |
| --- | ---: | ---: | ---: | ---: |
| 0 | 48816365 | 48816381 | 1s | 4s |
| 1 | 49493203 | 49493222 | 1s | 1s |
| 2 | 49328437 | 49328456 | 1s | 1s |

The samples were taken at least 15 seconds apart. Every shard advanced, every delay stayed below 10 seconds, and a real cast query for FID 2 returned a message. The CLI exited successfully with `SYNC VERIFIED`. The hosted client's HTTPS health check also passed with certificate verification enabled.

The private deployment retains `sync-evidence.json` and rotating setup logs. They are excluded from the repository. This record contains the relevant sanitized measurements. No new account payment or social action was performed during recovery.

## What changed in setup

New AWS and local installs now pin the same 0.15.0 image. Updating the repository alone does not change an existing deployment. The CLI deliberately leaves an already-started node alone; it does not silently upgrade a restore.

GitHub's latest-release endpoint still returned 0.14.3 during diagnosis even though the 0.15.0 tag and image were published. Future upgrade checks should compare official source tags, successful publication runs, registry digests and protocol activation rules. A version string or the word “latest” alone is insufficient.

For a future stall, use `./farcaster watch --verbose` and inspect the first error around the stopped height. Leave progressing snapshot restoration alone. Diagnose a repeatable validation mismatch before restarting or replacing data. After a reviewed upgrade, rerun two-sample sync and a real read.

This verifies recovery of the existing server. It does not complete fresh-server full-sync acceptance, physical-phone installation, manual wallet testing or an independent walkthrough. Those limits remain in [readiness](READINESS.md).
