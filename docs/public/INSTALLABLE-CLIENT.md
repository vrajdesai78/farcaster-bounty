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
