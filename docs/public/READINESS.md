# Publication and bounty readiness

- [x] Own-node sync: advancing heights and single-digit delays in two samples, real read.
- [x] Real client casts/replies, reactions and reversals, follow/unfollow, app include/exclude.
- [x] Gasless signer registration, import/reconnect, forget, self-revoke, inactive-key rejection.
- [x] Desktop/tablet/mobile layout and local proxy checks.
- [x] New three-command helper with stable EC2 token, private state, explicit paid-resource acknowledgement and ownership-checked cleanup.
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

Verification: 46 Python tests passed, including streamed output, credential filtering, resume behavior, timeout and owned-process cleanup. Browser checks covered command generation/copying, validation, responsive widths and natural diagram explanation height. The source archive passed its allowlist/secret scan. A live read-only watch against the existing server worked and correctly refused readiness: shard 1 stayed at height 49477354 while other shards advanced, with roughly four hours of delay. No restart or fresh paid provisioning occurred. Earlier successful sync evidence is historical; current readiness must be checked again after recovery. These checks do not complete fresh-server full-sync acceptance.
