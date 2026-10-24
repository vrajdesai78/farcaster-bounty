# Publication and bounty readiness

Latest existing-server verification: **24 October 2026, 10:11 UTC**. Snapchain **0.15.0**, all shards advancing with delays below 10 seconds, real cast read and hosted HTTPS health passed. See the [node recovery record](NODE-RECOVERY.md). Historical checks and unresolved acceptance limits follow.

- [x] Own-node sync: advancing heights and single-digit delays in two samples, real read.
- [x] Real client casts/replies, reactions and reversals, follow/unfollow, app include/exclude.
- [x] Gasless signer registration, import/reconnect, forget, self-revoke, inactive-key rejection.
- [x] Desktop/tablet/mobile layout and local proxy checks.
- [x] Optional encrypted device recovery, logout, unlock and removal: unit and desktop/mobile browser checks with intercepted node responses. This is not a live mainnet recovery test; see [local recovery verification](LOCAL-RECOVERY.md).
- [x] Continuous setup CLI and separate stage commands with stable EC2 token, private state, explicit paid-resource acknowledgement and ownership-checked cleanup.
- [x] Responsive static tutorial, public source download instructions, licenses and Vercel guide configuration.
- [x] Clean source archive installed the client and read the existing node through the three-command adoption path; two-sample helper verified sync. This is not a fresh AWS provisioning run.
- [x] Fresh session and clone: all three commands passed on a new AWS server on 21 October without installation fixes (pinned commit `7f55e8a`). Existing local tools and AWS/GitHub authentication were reused.
- [ ] Full sync, real reads and social actions on that fresh server. The 21–22 October test ended without these checks, and its test resources were deleted. Installation success alone does not establish full acceptance.
- [ ] Independent human follows the full tutorial on their own server/client and publicly endorses it.
- [ ] Manual wallet-extension and positive recovery-phrase live checks. The live wallet path used an automated local signing bridge.
- [x] Repository published under MIT; Vercel microsite deployed and checked.
- [ ] Exact original-cast timestamp and seven-day cutoff verified.
- [ ] Submission reply contains the real microsite, MIT repository and genuine endorsement URLs.

Do not replace missing endorsement or source-access URLs with placeholders. The guide and MIT source repository are public. Vercel publishes the guide from `main`; the optional GitHub Pages workflow is manual.

`./farcaster client` deploys a separate production service and Caddy on the node host; `--local` preserves development mode. Live HTTPS, reads, signed social actions and revocation passed on the existing server; see [hosted evidence](HOSTED-CLIENT-VERIFICATION.md). The fresh-server run remains separate evidence and is not complete.

The 23 October retry was cancelled by the operator before node installation. Its replacement test instance and dedicated resources were cleaned up; it contributes no new sync/read/write acceptance evidence.

## Copy/paste walkthrough review — 23 October 2026

The default AWS path requires no source/config edits after prerequisites. The guide now supplies copy controls for tool checks, browser-based AWS login/SSO, cloning, setup, sync and a saved-host SSH session. Public IP, optional region/profile/subnet and an adopted node's directory are entered in form fields that generate shell-quoted commands. Cleanup previews print a complete confirmation command containing the saved instance ID. The all-local client prints a copyable project-directory command for a second terminal. Existing-account and funded OP signup instructions match the current client.

A recording must use separate fresh-clone state if it is intended to show a new deployment. Reusing the current deployment folder resumes its recorded server. AWS account activation/permissions, installed tools, an existing default VPC/subnet (or an appropriate existing public subnet), wallet approval and optional OP funding remain user prerequisites. The guide does not automate those account/provider decisions.

Verification: 26 Python tests, guide copy/validation checks at 320/390/768/1440 widths, and source packaging passed. The new SSH helper was tested with a mocked saved host; no new EC2 instance, paid account transaction, node restart or cleanup action was performed during this review. This review does not complete fresh-server full-sync acceptance.

## Continuous setup CLI — 24 October 2026

`./farcaster setup` now runs provisioning, node installation, HTTPS client deployment and ongoing sync monitoring in one session. `--local` runs both services on suitable local hardware. `./farcaster watch` reconnects to an existing deployment without changing services. The earlier stage commands and legacy launchers remain compatible. Selected installation/build output streams immediately; node logs are summarized by default, with `--verbose` for sanitized diagnostics. Local state and rotating logs stay out of the source archive.

Verification: 46 Python tests passed, including streamed output, credential filtering, resume behavior, timeout and owned-process cleanup. Browser checks covered command generation/copying, validation, responsive widths and natural diagram explanation height. The source archive passed its allowlist/secret scan. A live read-only watch against the existing server worked and correctly refused readiness: shard 1 stayed at height 49477354 while other shards advanced, with roughly four hours of delay. No restart or fresh paid provisioning occurred. This describes the pre-recovery test; the subsequent successful recovery is recorded below. These checks do not complete fresh-server full-sync acceptance.

## Node recovery — 24 October 2026, 10:11 UTC

The stalled shard above was caused by protocol incompatibility: 0.14.3 rejected a non-Pro banner in a committed block, then its worker panicked on a state-root mismatch. Upstream [PR #1054](https://github.com/farcasterxyz/snapchain/pull/1054) supplies the updated rules. The official 0.15.0 image (tag commit `83c75b4f5f1c57b8fb6ab72d06eba48c26c4fbba`, published 23 October) was applied by immutable digest, preserving the existing database. Shard 1 passed the formerly failing block and replayed its backlog.

At 10:11:39 UTC, `./farcaster watch --once` passed the original readiness gate: every shard advanced across two samples, every delay stayed below 10 seconds, and a real cast read succeeded. The hosted client's HTTPS health check passed; its services were not restarted. New setup defaults now pin 0.15.0. Forty-six Python tests and the source archive scan passed. No new resources, disk/instance performance changes or paid account actions were used. This recovery validates the existing server; fresh-server full-sync acceptance remains incomplete.


## Source and microsite reconciliation — 25 October 2026

The encrypted recovery/logout change (`f8e44a4`) and the public guide reading-flow update (`7343d43`) are both ancestors of GitHub `main`. No unmerged branch changes remain from these two features. The repository is public, defaults to `main`, and contains the same `site/index.html`, `site/guide.js` and `site/styles.css` served by the public Vercel microsite (byte-for-byte comparison). The guide remains a public setup guide, with no presenter cues or recording-specific commands.

The README feature list, security notes and contributor instructions have been reconciled with the current implementation. [Local recovery verification](LOCAL-RECOVERY.md) records the behavior, test scope and remaining limits. Existing live-test records above remain dated evidence; the source audit does not establish a fresh full-sync pass, manual wallet run, new mainnet action or independent endorsement.
