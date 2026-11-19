# Current WorkOrder build

Updated 2026-11-19. This file supersedes earlier script sizes and counts in the historical audit command log.

- Four spending paths: joint approval to the maker; joint cancellation to the client at any time; unilateral client refund after the agreed block; and a mediator-authorized split pinned to both parties.
- Useful Solidity-style breadth now includes constants, authorization/policy modifiers, internal payout helpers and explicit public/internal visibility, alongside native BCH signatures, introspection and CLTV. It still does not claim to use most language features.
- Default public sample parameters (refund height 936500): **432-byte redeem script**, SHA256 `247e55545ccc4d1ffb2b7ce618aabef5b83f58ecc717f22de9c3cd4de06d4c9e`. All earlier sample addresses/artifacts are superseded. Never fund public fixture keys.
- Test fixture height 1000: 431-byte script; approval/cancellation 658-byte transactions with 571-byte unlocking scripts; refund 592/505 bytes; mediator split 630/509 bytes. Fee is 1800 sats in all local examples.
- **33 SolidHat tests passed across two files** (latest rerun 2026-11-19 08:20 UTC). Solidity compile and Vite production build passed. The local HTTP VM demo returned all four paths with `chainBroadcast:false` and `mainnetExecuted:false`.
- A portable BCHN 29.2.0 binary was verified against the published Windows archive hash and is kept under ignored `tooling/`; it is not installed system-wide. The isolated local regtest accepted approve, cancel, mediator split and post-height refund. It rejected redirected payouts, a wrong signer, early refund and a final sequence that disabled locktime. Full results and exact IDs are in ignored `artifacts/regtest/workorder-node-acceptance.json`; no settlement was submitted.
- The regtest was explicitly a local BCHN 29.2.0 test with `acceptnonstdtxn=0`; its May 2027 upgrade status reported `mempool_activated:false`. This is not evidence of Chipnet/mainnet behavior or that future activation.
- No funds sent, network deployment, sponsor message or upstream PR. Synthetic public fixture scalars were used only in the isolated local ledger.

Remaining operator actions: independent contract review; provision a local BCHN regtest node and separate node-backed transaction fixtures; execute the read-only checks in `REGTEST-CHECK.md`; collect Chipnet evidence with separate dev wallets; then authorize minimal mainnet validation if the preceding gates pass. Review the Windows launcher candidate before deciding whether to submit an upstream PR.

Final handoff validation: `npx solidhat doctor --json` exited 0 with code healthy and no project issues. The 33-test suite and production build were rerun after adding the local-node harness. Remaining operator actions: independent contract review; repeat the documented local regtest checks if desired; collect Chipnet evidence with separate dev wallets; prepare a public hosted demo and repository; then consider minimal mainnet validation only after reviewing exact parameters and artifacts. Review the Windows launcher candidate before deciding whether to submit an upstream PR.

