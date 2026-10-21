# Hosted client containers

Pinned 21 October 2026 from the official Docker Hub manifest lists:

- `node:24-alpine` → `sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f`
- `caddy:2-alpine` → `sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f`

The build runs locked npm dependencies. The runtime contains only the compiled browser client and the dependency-free production service. It has no Vite server, wallet secrets or SSH key. Caddy handles HTTPS and renewals. The existing Snapchain service is not rebuilt or restarted.

Default hostnames use sslip.io, a public DNS service, plus automatic ACME certificate issuance. No purchased domain is required. DNS service availability and certificate-authority limits still apply. A custom domain is optional; point its A record to the server before using `--domain`.
