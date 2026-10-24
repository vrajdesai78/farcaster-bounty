# Security and disclosure

Never commit custody/app keys, recovery phrases, AWS credentials, .env files, private deployment logs or .relay-state/.snapchain-aws. The source packager uses an allowlist, rejects symlinks and scans text for secret patterns; still review the staged files before publishing.

The client proxy binds to loopback, rejects foreign origins/hosts, allowlists routes and caps signed write bodies. The public static guide never accepts keys and never calls a node. A local browser/session is not a secure enclave: use disposable accounts, prefer delegated wallet signing, and revoke unused keys.

Managed SSH ingress is /32. HTTP/metrics bind to server loopback; peer ports 3382/UDP and 3383/TCP are public. Peer exposure is intentional network participation, not an authenticated private API. Do not expose the Vite server, Grafana defaults or secrets. Inspect any policy changes before using a different network topology.

Provisioning and account registration are paid operations with explicit acknowledgement. No shutdown timer is installed by default; the operator is responsible for cleanup/billing. Lifecycle commands refuse adopted hosts and mismatched ownership tags. Destruction is permanent.

Report sensitive findings privately through the repository owner’s contact channel; do not open a public issue containing keys or personal data.

The hosted website login can be explicitly disabled with `./relay client --public` and restored with `--private`. Public access does not authorize account writes: Snapchain validates each signed message. An Origin check is a browser safeguard, not authentication for arbitrary HTTP clients. No server-side custody key or signing endpoint is exposed. Keep raw node APIs behind the firewall so users cannot bypass gateway budgets. Public traffic can still consume server resources; rate limits and container isolation are safeguards, not an absolute security guarantee.


## Optional device recovery storage

Recovery import is processed in the browser. Saving is off by default. When the user explicitly opts in, `client/src/recovery.ts` stores only a versioned AES-256-GCM ciphertext record in localStorage, with a random 16-byte salt and 12-byte IV. PBKDF2-SHA-256 derives the key from a separate device password using 600,000 iterations. The app never persists that password or sends the phrase/password to its server. Active app private keys remain in memory.

Log out clears the current tab's active signer and unsent draft; it preserves the encrypted recovery record. Remove saved recovery deletes only that record. Neither action revokes network authorization; use Revoke authorization for that. Account logout also does not end a hosted HTTP Basic browser session. Reloading requires unlocking saved recovery and explicitly authorizing a new gasless app key before posting.

Keep an independent recovery backup. Browser data can be cleared, and the device password cannot be reset. Local encryption does not protect a phrase while it is unlocked in a compromised page or browser. Test vectors in automated tests are public fixtures, never funded accounts. See [verification and limits](docs/public/LOCAL-RECOVERY.md).
