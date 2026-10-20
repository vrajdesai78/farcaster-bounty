# Contributing

Read SETUP.md and docs/public/READINESS.md. Keep claims tied to evidence; do not present mocked provisioning or automated signing bridges as independent human reproduction.

Checks from the root:

```sh
python3 -m unittest discover -s tests -v
python3 scripts/prepare-repo.py
```

Client checks: `cd client && npm ci && npm test && npm run build`. Static guide: `python3 scripts/serve-site.py`, then inspect desktop and mobile, command-copy validation, server-method switching, chapter navigation and source download. No build step is needed for site HTML/CSS/JS.

`relay` is Python 3.9+ with standard-library dependencies. Use subprocess argument arrays, private resumable state and stable EC2 client tokens. Never add implicit cloud-resource changes, restarts during progressing restore, automatic cleanup or embedded keys. Update the pinned image/config and upstream notice deliberately together, with an upgrade test.

Review `.gitignore`, run the public packager and inspect its file manifest before publishing. Screenshots under site/assets contain public disposable test-account content, not secrets. Retain upstream configuration/font licenses. Repository/site publishing and the bounty reply are separate operator actions.
