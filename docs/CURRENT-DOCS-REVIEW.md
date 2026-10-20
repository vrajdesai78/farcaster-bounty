# Farcaster and Snapchain: current documentation review

Checked 19 October 2026. Retrieved the 39-page Snapchain documentation source set at commit `fc87f2686472598143062a00e1c2b2633b2d87ab`, reviewed the principal guides and relevant API references, and cross-checked the published account, username, architecture and writing guides. This is a scoped implementation review, not a claim that every example or API has been executed.

## Concepts for the microsite

| Concept | Meaning and consequence |
| --- | --- |
| Farcaster | The social protocol: accounts, signed social actions and shared state. Relay is one client for it. |
| FID | Stable numeric account identifier. Use it as the account key; usernames can change. |
| Username | Human-readable name linked to the account. Fnames and onchain ENS names have different ownership/registration systems. |
| Custody wallet | Ethereum account controlling the FID and authorizing account keys. A recovery phrase can control this wallet; it is not an app key. A recovery address is a separate account-recovery mechanism. |
| App signer | Ed25519 key delegated to publish permitted messages for an FID. Keep custody authorization separate from routine message signing. |
| Gasless key registration | A custody-authorized KEY_ADD message registers a signer without an onchain key-registration transaction. Existing onchain signers remain supported. Account creation and storage payment are separate and may still cost money. |
| Scope, TTL and nonce | Permissions, a sliding expiry window (maximum 90 days), and replay protection. Only a merged message refreshes the window. Ordinary scopes exclude KEY_ADD/KEY_REMOVE; self-revocation is a separate authorized operation. |
| App attribution | requestFid identifies the requesting app, not necessarily the posting account. Our current self-authorized flow uses the user's own FID; do not present it as a shared Relay app identity. |
| Protocol message | Signed data representing a cast, reaction, follow/link, profile change or other action. Network, FID, timestamp and exact encoded bytes matter. |
| Storage rent | The account's protocol storage allowance. Separate from the server's SSD capacity. Query current limits instead of copying old quota/pricing examples. |
| Read node | Follows decided blocks, verifies commits, maintains state and serves queries. It also accepts and relays signed writes. It does not vote or keep a pending-message mempool. |
| Validator | Orders messages and participates in consensus. Running our read node does not make us a validator or earn node rewards. |
| Snapshot and catch-up | Download/decompress prior state, then follow newer blocks. A completed download alone is not proof of sync. |
| Shards | Separate chains partition state. numShards counts message shards; shardInfos also includes shard 0. Check each reported shard. |
| API | HTTP is convenient for our local proxy; gRPC also provides streaming. These are interfaces to the same node, not separate social networks. |
| Event | Notification of a state change, distinct from a user's signed message. Event history is pruned, with a three-day default; keep per-shard cursors and backfill after gaps. |
| Feed | Client-assembled results from follows and casts. Our bounded chronological feed is not a complete recommendation service. |

## Correct write flow

1. Use an existing test FID and verify its custody address and storage allowance.
2. Generate an app signer. Obtain the appropriate custody and requesting-app authorizations for gasless KEY_ADD, including current nonce, scopes and TTL.
3. Submit KEY_ADD to our own read node and confirm it has merged before using the key.
4. Build and sign a social message with the SDK, preserving dataBytes; submit protobuf bytes with application/octet-stream.
5. The read node validates and gossips it. Validators may include it in a block; read nodes then apply that block.
6. Confirm inclusion through a MERGE_MESSAGE event or read-back by message identity. Relay acceptance alone is insufficient. Use bounded waiting/resubmission because the read node retains no pending message.
7. Explain the difference between forgetting a local key and revoking its network authorization.

## Documentation differences to account for

- The introductory Accounts/Architecture pages still describe onchain key registration as the only route. The current Snapchain writing guide explicitly documents gasless mainnet signers (engine V16).
- The writing guide's linked example repository still registers its signer onchain; the guide itself warns about that mismatch. Its example also logs a custody private key: omit secret logging from our tutorial.
- Use signersByFid for both gasless and onchain keys. onChainSignersByFid alone omits gasless keys, despite older reference descriptions suggesting completeness.
- The migration guide requires dataBytes, says submitMessage is best effort, and warns that Hub event IDs no longer encode timestamps. Do not use old timestamp-extraction helpers.
- The HTTP pagination reference defines pageToken, but its JavaScript loop uses nextPageToken as the request parameter and omits Axios's response.data access. Follow the parameter definition and decode the response correctly.
- HTTP references retain older Hub terminology. Treat that as naming history, not a separate node requirement.
- Whitepaper and sample responses explain architecture; their historical quotas, versions and numbers are not current operational defaults.
- The AWS walkthrough's approximate $100/month is not a verified quote for our instance plus 2 TB disk. Use actual region/provider prices and include retained disks and performance charges.
- The installer targets ~/snapchain and may manage upgrades and host-wide Docker pruning. Our existing deployment is /opt/snapchain. Do not reinstall over it or restart a progressing restore to match a tutorial path.

## Verification and remaining work

For sync evidence, require single-digit blockDelay and advancing maxHeight for every shard in two samples, then perform a real read. This documentation review is not a fresh node status check.

Before a bounty-ready claim: verify live signer registration, real write inclusion, bounded retry/confirmation, both include/exclude app filters, mobile/desktop behavior, a reproducible three-command setup, and an independent person's successful setup and public endorsement. Confirm the original cast's exact timestamp before publishing an exact deadline.

## Sources

- [Pinned documentation source](https://github.com/farcasterxyz/snapchain/tree/fc87f2686472598143062a00e1c2b2633b2d87ab/site/docs/pages)
- [Accounts](https://docs.farcaster.xyz/learn/what-is-farcaster/accounts)
- [Usernames](https://docs.farcaster.xyz/learn/what-is-farcaster/usernames)
- [Architecture](https://docs.farcaster.xyz/learn/architecture/overview)
- [Node roles and relay semantics](https://github.com/farcasterxyz/snapchain/blob/fc87f2686472598143062a00e1c2b2633b2d87ab/site/docs/pages/node-types.mdx)
- [Writing messages and gasless signers](https://snapchain.farcaster.xyz/guides/writing-messages)
- [Migration](https://snapchain.farcaster.xyz/guides/migrating-to-snapchain)
- [Getting started](https://snapchain.farcaster.xyz/getting-started)
- [Node management](https://snapchain.farcaster.xyz/guides/managing-a-node)
- [HTTP API](https://snapchain.farcaster.xyz/reference/httpapi/httpapi)
- [Storage limits](https://snapchain.farcaster.xyz/reference/httpapi/storagelimits)
- [Events](https://snapchain.farcaster.xyz/reference/httpapi/events)
- [Info](https://snapchain.farcaster.xyz/reference/httpapi/info)
