# WorkOrder

A small delivery escrow for independent makers, built with SolidCash and SolidHat for BCH BLAZE 2026.

WorkOrder reserves one plain BCH UTXO for a deliverable. It has four paths: client and maker jointly approve a payment to the maker; both parties may jointly cancel to the client immediately; the client refunds after an agreed block; or an agreed mediator signs a split between the two fixed payout scripts. The mediator can choose an allocation but cannot redirect the escrow to their own address. The UI makes the timeout and mediator trust explicit.

## Run

Requires Node.js 22+.

```sh
npm ci --ignore-scripts
npm run dev
npm run build
npm run solidhat:compile
npm run solidhat:test
```

The UI compiles the real WorkOrder contract from entered public keys and terms, derives its address, and generates a reviewable transaction plan. The plan contains the exact payout addresses, locking scripts, satoshis, signer roles, locktime, input sequence, redeem script hash and byte size. Download it as JSON. Changing terms clears the old plan. Prefilled public keys are publicly known examples: never fund a sample address.

The browser calls the same local planning module as the CLI through `/api/plan`. Start with `npm run dev`, or run `npm run build` followed by `npm run preview`. The compiler endpoint is part of this local Vite configuration; uploading `dist/` alone to a static host will not provide planning. It performs no network lookup and accepts only public parameters. The planner has no private key fields or signing endpoint. It distinguishes an entered funding reference from a verified unspent output.

For a plan from the CLI, set the public settings in `.env.example`, including `ORDER_SATS`, then run `npm run order -- plan approve` (or `plan cancel` / `plan refund` / `plan resolve`). `plan resolve` also needs `MAKER_SATS`. Optional `CURRENT_HEIGHT` is self-reported and never presented as chain verification. Plans can omit the funding transaction ID and index while reviewing terms; signed transaction preparation requires both. All amounts are integer satoshis encoded as decimal strings in JSON.

## Contract lifecycle

1. Agree on three independent compressed public keys (client, maker, mediator), a refund block below 500000000, and a fee cap at most 10000 sats.
2. Set the public settings from `.env.example` in the shell. The CLI reads shell environment variables, not `.env` files automatically. Keep WIF secrets local.
3. Run `npm run order -- address` to derive a Chipnet P2SH32 escrow address. Each change of terms or contract source changes the address. Independently compare the keys, payout addresses, refund height and redeem script hash before funding. The current contract adds minimum payout checks, so addresses from the earlier 359-byte build must not be reused with the new artifact.
4. Send one small plain BCH output to that address. Record its transaction ID and output index as `ORDER_TXID` and `ORDER_VOUT`.
5. After independent review and real-node validation, set the required role WIFs in the local shell and run `npm run order -- approve`, `cancel`, `refund`, or `resolve`. The script selects only that explicit plain BCH UTXO, reads its actual value and current chain tip, checks payout dust and fee bounds, then writes a signed transaction to `artifacts/signed-review.hex` and its plan to `artifacts/transaction-review.json` without broadcasting. A refund needs a tip at least the locktime height to be eligible for a later candidate block. The CLI checks final encoded transaction/input sizes and the documented 1 sat/byte fee floor before writing files.
6. Inspect the raw transaction in an independent BCH decoder. Broadcasting and chain evidence remain a manual final step. Use an externally reviewed signing arrangement for real participants; the current CLI combines signers locally for a controlled demo.

`approve` requires both client and maker. `refund` requires the client and a reached chain height; the builder sets transaction locktime and a nonfinal sequence. `resolve` requires the mediator and `MAKER_SATS`, with at least 546 sats to each side. Both parties may instead jointly approve for a full maker payout, and timeout provides the full client payout. These output minimums keep the simple split within standard dust policy.

The direct contract has no mutable shared state or NFT ledger. Spending the order UTXO settles it once. Refund is not an automatic cancellation: after the refund height, either an approval or refund transaction may win the spend race. The maker should stop work or renegotiate before the deadline. The contract rejects token-bearing inputs so accidental token funding is unsupported and can become stuck. Never send tokens to this BCH-only escrow.

## Bounty evidence status

- Original Solidity-syntax contract: implemented using `pragma solidity` and `evmCompat: true`.
- SolidHat configuration and published 0.51.1 dependencies: included.
- Functional planning UI: implemented.
- Chipnet / mainnet transaction: **not performed**. No keys or funds were supplied.
- SolidHat contract tests: **33 passed**, using the official SolidHat preset/HRE and production-limit mock BCH VM. Windows uses a project launcher workaround that preserves the SolidHat compile/runtime flow.
- Independent security review: pending. Compile success alone does not establish contract correctness or mainnet transaction validity.

Completed checks: Vite build, SolidHat compile, 33 SolidHat tests, offline public-parameter planning and the local VM HTTP lifecycle endpoint. The planner default script is 432 bytes; fixture height 1000 produces 431 bytes. All four paths executed in the local BCH VM. No real network execution occurred.

Required final work: independent review, real-node finality/consensus checks, Chipnet lifecycle and minimal mainnet lifecycle. Retain artifact hashes, raw bytes and explorer links. Fixture transaction sizes are 658 bytes (approval or cancellation), 592 (refund) and 630 (split), at 1800-sat fees. See `docs/EVIDENCE.md`.

See `docs/BOUNTY-AUDIT.md` for the criterion matrix, exact commands and manual gates. `docs/UPSTREAM-FINDINGS.md` documents the Windows launcher issue and mock chain-finality limitation. This compact covenant does not claim to use most SolidCash language features or satisfy the mainnet requirement yet.

## Sources and tooling

Research date: 2026-11-19.

- Official bounty: https://bchblaze.cash/bounties/ (Best SolidCash Application; Solidity on BCH, SolidHat tests, mainnet lifecycle required).
- Upstream implementation and limitations: https://github.com/solidcash/solidcash
- Public agent/language reference: https://solidcash.org/AGENTS.md
- SolidHat source documentation: https://github.com/solidcash/solidcash/tree/master/packages/solidhat

The local reference checkout in ignored `tooling/solidcash` is upstream commit `eda85a88d752525ab1fe92f03e9dba04a45b518a`, MIT licensed. Project contracts/UI are fresh. The current upstream README documents unauthenticated `msg.sender` in direct composition, so WorkOrder authenticates every path with `checkSig` and avoids composition. No upstream bug is being claimed or PR fabricated.



The lifecycle UI now includes a local VM runner for approval, cancellation, refund and mediator split. It uses a separate order with publicly known fixture keys, reports actual VM results/payouts/sizes and clearly labels mock mode. It does not broadcast to any chain.



Current build details are in docs/CURRENT-STATUS.md. The contract now uses constants, shared order-policy/joint-consent modifiers and internal payout helpers. Its new cancel path returns the escrow to the client with both signatures before the timeout. This source change supersedes every earlier address and artifact.

A read-only regtest acceptance checker is available as npm run node:check -- <signed-regtest-transaction.hex>. It verifies local chain identity and calls only testmempoolaccept; no node is installed on this machine and no real-node result is claimed. See docs/REGTEST-CHECK.md for the operator inputs and evidence steps.


