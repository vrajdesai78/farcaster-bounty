# Security and disclosure

Never commit custody/app keys, recovery phrases, AWS credentials, .env files, private deployment logs or .relay-state/.snapchain-aws. The source packager uses an allowlist, rejects symlinks and scans text for secret patterns; still review the staged files before publishing.

The client proxy binds to loopback, rejects foreign origins/hosts, allowlists routes and caps signed write bodies. The public static guide never accepts keys and never calls a node. A local browser/session is not a secure enclave: use disposable accounts, prefer delegated wallet signing, and revoke unused keys.

Managed SSH ingress is /32. HTTP/metrics bind to server loopback; peer ports 3382/UDP and 3383/TCP are public. Peer exposure is intentional network participation, not an authenticated private API. Do not expose the Vite server, Grafana defaults or secrets. Inspect any policy changes before using a different network topology.

Provisioning and account registration are paid operations with explicit acknowledgement. No shutdown timer is installed by default; the operator is responsible for cleanup/billing. Lifecycle commands refuse adopted hosts and mismatched ownership tags. Destruction is permanent.

No hosted security contact is configured before repository publication. Report sensitive findings privately through the eventual repository owner's contact channel; do not open a public issue containing keys or personal data.

The hosted website login can be explicitly disabled with `./relay client --public` and restored with `--private`. Public access does not authorize account writes: Snapchain validates each signed message. An Origin check is a browser safeguard, not authentication for arbitrary HTTP clients. No server-side custody key or signing endpoint is exposed. Keep raw node APIs behind the firewall so users cannot bypass gateway budgets. Public traffic can still consume server resources; rate limits and container isolation are safeguards, not an absolute security guarantee.
