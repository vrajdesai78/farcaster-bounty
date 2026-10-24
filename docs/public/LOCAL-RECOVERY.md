# Local recovery storage and logout

Source changes: `f8e44a4` (encrypted recovery and logout), merged to `main` with `7343d43` (guide reading flow). Documentation reconciled on 25 October 2026.

## Behavior

- Recovery-phrase import detects the account using the first Ethereum account of an English BIP-39 phrase, without an additional BIP-39 passphrase.
- Saving is off by default. After account detection, Save recovery on this device requires a separate device password of at least 12 characters and matching confirmation.
- The localStorage record contains a version, random salt, IV and ciphertext only. AES-256-GCM uses a PBKDF2-SHA-256 key derived with 600,000 iterations. The phrase and password are not uploaded; the password and active app key are not persisted.
- After successful app-key authorization, the encrypted phrase is saved only when opted in. If storage fails, the connected session remains available for logout or revocation and the UI reports the save failure.
- Log out clears the active signer and draft in the current tab. Saved recovery stays encrypted. Remove saved recovery deletes only that encrypted record.
- Reload does not restore an active signer automatically. Unlock saved account requires the device password, then the user explicitly authorizes a new gasless app key. Unlocking alone does not register a key or post.
- Revocation and the hosted website login are separate from account logout. Keep an independent backup phrase; browser data may be cleared and forgotten device passwords cannot be reset.

## Validation recorded for these changes

| Check | Result |
| --- | --- |
| Client unit/protocol/hosted tests | 46 passed |
| Repository Python checks | 46 passed |
| TypeScript and production build | Passed; existing upstream SDK eval warning remains |
| Desktop browser, 1440 × 1000 | Save, reload, bad-password rejection, unlock, explicit authorization, logout/draft clearing, removal passed |
| Mobile browser, 390 × 844 | Same flow passed |
| Saving off by default | No recovery record written without opt-in |
| Blocked browser storage | Authorized session retained; actionable save-failure notice |
| Crypto checks | Random salt/IV/ciphertext, round trip, wrong password, tampering, malformed data and storage failure covered |
| Public guide, 1440 and 390 widths | Section order, chapter links, generated commands, copy controls, hosting switches, no horizontal overflow or browser errors |

Browser checks used installed Google Chrome through Playwright because the Browser plugin was unavailable. All node API requests were intercepted. Tests used a public BIP-39 vector and registered no live signer, sent no real social message, transferred no ETH and created no AWS resources.

Reproduce from `client/`:

```sh
npm ci
npm test
npm run build
npm run test:ui
```

The browser tests require an installed Playwright Chromium browser; use `PLAYWRIGHT_CHANNEL=chrome npm run test:ui` to use an existing Google Chrome installation.

## Scope and deployment

Implementation: `client/src/recovery.ts`, `client/src/components/SignerDialog.tsx` and `client/src/App.tsx`. Automated checks: `client/test/recovery.test.ts` and `client/e2e/recovery.spec.ts`. User instructions: `SETUP.md` and `site/index.html`.

This verifies implementation and fixture behavior, not manual wallet-extension operation or a positive recovery-phrase flow on mainnet. Publishing the repository or Vercel guide does not redeploy an existing EC2 client. Operators deploy the current client source separately with `./farcaster client` from the existing deployment folder/state. The static microsite never collects a phrase or signs actions.
