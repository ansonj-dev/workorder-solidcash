# Evidence ledger

| Gate | Status | Evidence |
| --- | --- | --- |
| Original contract | Implemented | contracts/WorkOrder.sol |
| SolidHat integration | Configured | solidcash.config.ts |
| Planner UI | Production build passed | Vite 6.4.1; 4 modules |
| Compiler result | Passed | SolidHat compiled 1 source / 1 artifact with 0.51.1 |
| Public-parameter transaction plan | Implemented; offline CLI invocation passed | Shared `lib/plan.ts`; browser review and JSON export; no chain lookup |
| Mainnet constraints review | Documented | `docs/MAINNET-CONSTRAINTS.md` compares bundled upstream limits with planner/CLI safeguards |
| SolidHat tests | 33 passed | Official SolidHat HRE/preset; production-limit mock BCH VM |
| Local lifecycle UI | Endpoint passed | All four local VM spend paths; `chainBroadcast:false` |
| Local BCHN regtest | Passed | `docs/REGTEST-CHECK.md`; one real BCHN 29.2.0 regtest run accepted approve, cancel, split and reached-height refund; adversarial cases rejected with `testmempoolaccept` |
| Chipnet lifecycle | Pending funds and role keys | Record txids here |
| Mainnet lifecycle | Pending all preceding gates | Record txids here |

Do not present local planner previews as blockchain execution. Keep all private keys outside this ledger.

Offline public-parameter planning passed using publicly known sample public keys (never fund this address). Current sample redeem script: 432 bytes, SHA256 `247e55545ccc4d1ffb2b7ce618aabef5b83f58ecc717f22de9c3cd4de06d4c9e`. The earlier 359-byte contract is superseded; it derives a different address. This planner-default size/hash differs from the 431-byte fixture used by the 33 passing SolidHat tests. Local signed VM execution and one node-level regtest acceptance run passed; Chipnet and mainnet behavior remain unverified.

## Qualifying evidence still required

- [x] SolidHat tests: 33 passed, covering all four paths and focused adversarial cases. Local VM evidence only.
- [ ] Independent review of signatures, fixed payout scripts, fee cap, refund locktime/finality, token rejection and the mediator trust boundary.
- [ ] Chipnet funding reference and actual value/token-status lookup.
- [ ] Chipnet approval, reached-height refund and mediator split transaction IDs, raw bytes, fees, input sizes and explorer links.
- [x] Early-refund rejection and reached-height refund acceptance demonstrated under the documented BCHN regtest policy; conflicting-settlement competition on a live network remains unverified.
- [ ] Minimal mainnet lifecycle only after the prior gates; retain every deployment's exact source, compiler, terms, redeem script hash and artifact.
- [ ] Demo recording clearly distinguishing offline plans from mined transactions.

For each actual settlement, preserve: network, active funding txid/vout, input satoshis, exact public parameters, source/artifact/redeem hashes, path, required signers, output scripts/amounts, locktime/sequence, signed byte count, fee rate, current tip used for preflight, txid and confirmation evidence. No private keys belong in evidence files.

Dependency note: npm stalled preparing the Git libauth dependency. package.json overrides it to the codeload source archive at exactly the upstream-pinned commit 1cf4b432864b3a4ed9f33d1992355d7286f3dab8, which already includes build/. Installation with --ignore-scripts succeeded. No security check or compiler safety flag was disabled.




Latest build: see CURRENT-STATUS.md. A mutual cancellation path and shared modifiers/helpers were added; older addresses and hashes are superseded. `npm run node:workorder-regtest` performs an isolated local BCHN run, while `npm run node:check` remains a read-only operator-supplied transaction checker.



SolidHat doctor check: npx solidhat doctor --json returned severity info, code healthy, No SolidHat project issues found (exit 0). This is project configuration validation only.

