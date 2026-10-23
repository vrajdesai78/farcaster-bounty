# Publication and bounty readiness

- [x] Own-node sync: advancing heights and single-digit delays in two samples, real read.
- [x] Real client casts/replies, reactions and reversals, follow/unfollow, app include/exclude.
- [x] Gasless signer registration, import/reconnect, forget, self-revoke, inactive-key rejection.
- [x] Desktop/tablet/mobile layout and local proxy checks.
- [x] New three-command helper with stable EC2 token, private state, explicit paid-resource acknowledgement and ownership-checked cleanup.
- [x] Responsive static tutorial, private source access instructions, licenses and Vercel guide configuration.
- [x] Clean source archive installed the client and read the existing node through the three-command adoption path; two-sample helper verified sync. This is not a fresh AWS provisioning run.
- [x] Fresh session and clone: all three commands passed on a new AWS server on 21 October without installation fixes (pinned commit `7f55e8a`). Existing local tools and AWS/GitHub authentication were reused.
- [ ] Full sync, real reads and social actions on that fresh server. The 21–22 October test ended without these checks, and its test resources were deleted. Installation success alone does not establish full acceptance.
- [ ] Independent human follows the full tutorial on their own server/client and publicly endorses it.
- [ ] Manual wallet-extension and positive recovery-phrase live checks. The live wallet path used an automated local signing bridge.
- [x] Repository pushed (private); Vercel microsite deployed and checked. Source access for the bounty remains unresolved.
- [ ] Exact original-cast timestamp and seven-day cutoff verified.
- [ ] Submission reply contains the real microsite, MIT repository and genuine endorsement URLs.

Do not replace missing endorsement or source-access URLs with placeholders. The guide is public; source access currently requires repository permission. Vercel publishes the guide from `main`; the optional GitHub Pages workflow is manual.

`./relay client` deploys a separate production service and Caddy on the node host; `--local` preserves development mode. Live HTTPS, reads, signed social actions and revocation passed on the existing server; see [hosted evidence](HOSTED-CLIENT-VERIFICATION.md). The fresh-server run remains separate evidence and is not complete.
