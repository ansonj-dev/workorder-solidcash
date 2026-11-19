# SolidCash bounty audit

Checked 2026-11-19 against the supplied [Best SolidCash Application bounty](https://bchblaze.com/bounties/best-solidcash-application/). Sponsor: mainnet_pat. Published awards: 2 / 1 / 0.5 BCH. The DoraHacks page could not be fetched by the web reader; the official BLAZE bounty page is the source used here.

Current build status is summarized in `CURRENT-STATUS.md`. The command chronology below retains historical results; current code has four paths, 33 passing tests and a 432-byte default sample script.

## Criterion matrix

| Criterion | Current evidence | Assessment / remaining work |
| --- | --- | --- |
| Solidity source compiled natively to BCH with SolidCash | `contracts/WorkOrder.sol`, `evmCompat: true`, SolidHat 0.51.1 compile; real BCH VM spends in `test/workorder.test.ts` | Local implementation demonstrated. No EVM node is used. Solidity-compatible syntax includes native BCH types/intrinsics, so this source is not a claim of unchanged `solc` compatibility. |
| Deployable and runnable on BCH mainnet | Small P2SH32 script; production-limit mock accepts four paths; BCHN 29.2.0 regtest accepted approval, cancellation, mediator split and reached-height refund and rejected adversarial spends | **Mainnet requirement unmet.** Regtest node validation is local evidence only. Chipnet and minimal mainnet evidence remain necessary. |
| Broad SolidCash feature and syntax use | Constructor-baked terms; pubkey/sig/int types; constants; shared policy and joint-consent modifiers; public/internal visibility; internal payout helpers; signatures, BCH introspection, fixed payouts, height locktime and fee/dust invariants | Useful breadth improved with immediate mutual cancellation and shared verified policy. It still does not use most features (e.g. state NFTs, mappings, composition). No most-features claim is made. |
| Usable lifecycle UI | Real public-parameter plan review and JSON export; actual local VM execution of approval/cancellation/refund/split | Local lifecycle demonstration works. Wallet-coordinated funding, distributed signing and mainnet execution are absent. |
| Mandatory SolidHat tests | Actual SolidHat compile/HRE/preset, production-limit mock BCH VM, plus injected RPC boundary tests for the node checker | **33 tests passed.** Includes all four paths, modifier policy failures, wrong keys, redirection, fee/split/CLTV/sequence/token/conflicting-spend failures and plan/demo integration. Windows workaround documented. |
| AI-assisted fixes and upstream contributions | Two reproducible toolchain observations in `UPSTREAM-FINDINGS.md`; local Windows task workaround; proposed upstream launcher patch | No upstream PR opened. Finality finding is documented without claiming a completed upstream fix. Sponsor collaboration/PR consideration is a manual gate. |
| Originality / existing EVM ports | Fresh WorkOrder design and source; upstream SDK/compiler used under their licenses | No copied application or ported existing EVM project is claimed. Porting is permitted by the sponsor, not mandatory. |

## Exact local validation

Environment: Windows, Node v24.21.0; `@solidcash/solidhat`, `solidc`, `solidcash`, `testing` all 0.51.1; Vitest 5.0.4; Vite 6.4.1. Libauth is pinned to upstream's exact commit `1cf4b432864b3a4ed9f33d1992355d7286f3dab8` via its archive.

| Command | Result |
| --- | --- |
| Initial unmodified `npm run solidhat:test` | Exit 1 after compile, before Vitest. `spawnSync('npx', ['--version'])` reproduced `ENOENT` on Windows. |
| `npx.cmd vitest run --config vitest.solidhat.config.ts` | First run: 13/15 pass. Fixtures corrected to distinguish conflicting spend from idempotent rebroadcast, and to use a token-capable recipient for token rejection. |
| `npm run solidhat:test` after Windows task override | 15/15 pass. |
| Expanded `npm run solidhat:test` | 17/18 pass; correctly encoded future refund unexpectedly accepted by mock. Recorded limitation and added shared client finality guard coverage. |
| `npm run solidhat:test` after that finding | 18/18 pass, including explicit mock-limit observation. |
| `npm run solidhat:test` after UI VM demo integration | **19/19 pass**, 1 file; 4.23 s Vitest runtime. |
| `npm run build` | Pass; 4 browser modules, 180 ms in the recorded final run. |
| `npm run solidhat:compile` | Pass; 1 Solidity source, 1 artifact (cache hit in final run). |
| `Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:5185/api/demo'` | Local endpoint returned all three VM-accepted paths, zero remaining escrow outputs and the expected payouts. `chainBroadcast:false`, `mainnetExecuted:false`. |

Measurements are in `local-vm-measurements.json`. Fixture refund height is 1000, producing a 372-byte redeem script; planner defaults use height 936500 and produce 373 bytes because Script integer encodings have different lengths. Neither size by itself proves node-level validity.

## Manual gates

1. Independent review of the contract, threat assumptions and synthetic test coverage.
2. Review the recorded BCHN 29.2.0 regtest run, including chain-tip finality and standard transaction policy. Repeat it if the contract or toolchain changes. This local run does not substitute for Chipnet evidence.
3. Chipnet funding and three spend paths with separate dev wallets, retained artifact hashes, transaction IDs, raw bytes and explorer links. Never fund the public sample keys.
4. Minimal mainnet lifecycle with owner-approved dev funds after the preceding gates; preserve proof. No mainnet execution has occurred.
5. Review upstream findings, decide whether to submit a PR, and contact the sponsor only with explicit human authorization. No contribution or contact is being claimed.
6. Honest demo video/submission, clearly identifying local VM mode, supported capabilities, feature-breadth gap and actual network evidence.

Final follow-up: after correcting the public plan sequence to match the SDK's encoded nonfinal sequence, npm run solidhat:test passed 20/20 at 05:25:12 UTC (4.70 seconds Vitest runtime). Added an assertion comparing plan locktime/sequence directly with the SDK serialization. The unmodified upstream launcher candidate passed git apply --check against the bundled upstream source; it remains unsubmitted and unapplied.


Latest follow-up validation: `npm run solidhat:test` passed 33/33 across two files. New coverage includes mutual cancellation, shared modifier policy, and injected-RPC boundary checks. `npm run solidhat:compile` compiled the contract; `npm run build` passed. The local HTTP VM endpoint returned approve/cancel/refund/resolve with `chainBroadcast:false`. A later isolated BCHN 29.2.0 regtest run accepted approval, cancellation, mediator split, and a reached-height refund, and rejected adversarial spends. This updates the earlier historical note that no BCHN run had been performed. The regtest remains local evidence: no Chipnet or mainnet transaction was sent. See [CURRENT-STATUS.md](CURRENT-STATUS.md), [EVIDENCE.md](EVIDENCE.md), and [REGTEST-CHECK.md](REGTEST-CHECK.md) for the current scope and exact evidence.

