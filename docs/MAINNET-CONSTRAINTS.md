# WorkOrder and BCH constraints

Inspected the bundled upstream `tooling/solidcash/website/static/AGENTS.md`, sections "Limits and Costs", "Key Differences from Solidity", "Mock limits are not mainnet limits", and the upstream README at commit `eda85a88d752525ab1fe92f03e9dba04a45b518a` on 2026-11-19. This is an implementation assessment, not chain execution evidence.

| Upstream constraint | WorkOrder handling | Remaining evidence |
| --- | --- | --- |
| 10,000-byte unlocking bytecode per input; the P2SH redeem script counts | Current public sample contract is 432 bytes. Planner refuses scripts above 9,000 bytes as a conservative local policy. CLI inspects final input unlocking lengths before writing signed hex. | All four paths passed the production-limit mock VM; real node execution remains pending. |
| 100,000-byte standard transaction; 1,000,000-byte consensus maximum | The CLI enforces the lower standard size after final encoding. | Final signed transaction measurements for each path. |
| 201-byte standard output locking bytecode | WorkOrder uses a 35-byte P2SH32 funding output and 25-byte P2PKH payout outputs. | Inspect actual funding/settlement output scripts before funding or broadcast. |
| Dust: `444 + 3 * serialized output size` sats | Plain P2SH32 funding minimum is 576 sats (44-byte output). P2PKH payouts require at least 546 sats (34-byte output). Each split payout independently meets 546 sats. | Confirm current node relay policy. Extra funding should cover chosen fee and all payouts. |
| Documented minimum relay fee: 1 sat/byte | The CLI compares chosen fee against final transaction bytes. Fee is bounded by the agreed 1–10,000-sat cap. | Actual node policy and mined transaction fee rate. If the cap becomes insufficient, renegotiate before funding; contract terms are immutable. |
| Per-input operation budget `(41 + unlocking length) * 800` | Small bounded contract, no loops, mappings, external contract calls or keccak sidecars. | All four paths passed the local production-limit VM; real-node verification remains pending. |
| NFT commitments limited to 128 bytes | Contract has no state NFT or token ledger. All spend paths reject token-bearing active inputs. | Token-bearing input rejection passed in SolidHat tests. Token funding is unsupported and may be stuck. |
| `msg.sender` is not sufficient authentication in direct composition | Every path explicitly checks signatures against fixed party public keys. | Wrong-key and output-substitution SolidHat coverage. |
| Height locktime must be below candidate block height and input sequence nonfinal | Refund locks to the agreed height with sequence `0xfffffffe`. A current tip at least that height permits finality in a later candidate block. No upper-time constraint is inferred. | Early-refund rejection and reached-height acceptance on a real node. |
| Mock defaults may relax consensus/relay limits | Configuration requests 10,000-byte inputs, 128-byte commitments and dust enforcement. 33 SolidHat tests passed using the production-limit mock profile. | Real-node finality, Chipnet and minimal mainnet evidence. |

The artifact changed when minimum payout requirements were added. Current sample size is 432 bytes; the former 359-byte address is a different contract. Never mix an earlier address with a later artifact. Preserve each deployment's source, compiler version, exact public terms, redeem script hash, funding output and complete settlement transaction.

No security or compiler issue is being claimed against upstream. No upstream patch or PR was fabricated. The documented authentication concern shaped this design's explicit signatures.

Observed limitation: the production-limit mock accepts a correctly encoded height-1000 refund at tip900. CLTV parameter and sequence rejection work; node finality is a separate pending gate. See UPSTREAM-FINDINGS.md and BOUNTY-AUDIT.md for the retained reproduction and exact local results.



