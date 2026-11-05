# whitechain-facilitator

An [x402](https://docs.x402.org) v2 facilitator for [Whitechain](https://docs.whitechain.io), plus a documentation site and a public log of every payment it handles.

It lets an HTTP endpoint charge per request, and it pays the gas so the customer does not have to. A payer holding nothing but a stablecoin — **zero WBT** — can pay your API.

Serves **both** Whitechain mainnet (`eip155:1875`) and Sepolia (`eip155:1874`) from one URL.

## How it works

Your endpoint answers an unpaid request with `402 Payment Required` and the terms. The payer signs an EIP-3009 `TransferWithAuthorization` — a message, not a transaction, so it costs nothing and needs no gas token. Your server hands that signature here; we verify it, simulate it, then submit `transferWithAuthorization` on-chain and pay the WBT fee ourselves.

The stablecoin moves **directly from payer to merchant**. This service never holds funds, and the signature fixes the recipient, the amount, a validity window and a single-use nonce — so the only discretion we have is whether to submit it.

> There is no transaction batching involved. Gasless payments described as "grouping the payer's transaction with the facilitator's" are Algorand's atomic groups — a different model. On an EVM chain there is one transaction, sent by us, authorised by them.

## Quick start

```bash
pnpm install
cp .env.example .env          # fill in FACILITATOR_PRIVATE_KEY and DATABASE_URL
pnpm verify-assets            # proves the asset registry against both chains
pnpm migrate                  # creates payments_testnet and payments_mainnet
pnpm dev
```

Run `verify-assets` first. It checks every allowlisted token's EIP-3009 typehash, decimals, and EIP-712 domain against the token's own `DOMAIN_SEPARATOR()`. It exits non-zero on a mismatch and prints the correct values. Nothing downstream is trustworthy until it passes.

```
Whitechain Sepolia  USDC.e  0x5Eb541ba8A2DD841aF7864c3389162a23ddA8401
  decimals        ok
  eip-3009        ok (canonical typehash)
  separator       0x02c4779645b8009345e4ea4f18fd564ecab398b3581e107aca67a4be3f87f009
  domain          ok  { name: "Bridged USDC (Whitechain)", version: "2" }

3/3 assets verified.
```

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /verify` | x402 verification. Read-only, no gas, safe to call freely. |
| `POST /settle` | Submits the authorization on-chain and pays the WBT fee. |
| `GET /supported` | Scheme and network discovery, plus the signer that pays your gas. |
| `GET /assets` | Allowlisted assets per network with their **verified** EIP-712 domains. |
| `GET /health` | Per-network balance, budget, block height. `503` when degraded. |
| `GET /api/logs` | The payment log behind `/logs`. |
| `GET /api/stats` | Per-network totals. |

The base URL is the bare origin — no `/api` prefix, no rewrites — because `HTTPFacilitatorClient` builds `${url}/verify`. One URL serves both networks, since x402 carries the network inside the payment payload.

## Using it as a merchant

```ts
import { paymentMiddleware } from "@x402/express";

app.use(paymentMiddleware({
  "/api/report": {
    accepts: {
      scheme: "exact",
      network: "eip155:1874",
      payTo: "0xYourMerchantAddress",
      price: {
        asset: "0x5Eb541ba8A2DD841aF7864c3389162a23ddA8401",   // USDC.e
        amount: "10000",                                        // 0.01, six decimals
        extra: { name: "Bridged USDC (Whitechain)", version: "2" },
      },
    },
  },
}, { url: "https://your-facilitator.example" }));
```

**The price is written out longhand for a reason.** Neither Whitechain network is in `@x402/evm`'s `DEFAULT_ASSETS`, so the usual `price: "$0.01"` shorthand has no asset to resolve to and throws. You supply the three fields it would have filled in — and `extra` is the one that bites: it is the token's EIP-712 domain, and if it is wrong by a character every signature recovers to a different address and fails with no transaction and no revert to debug. Fetch verified values from `/assets` rather than guessing.

## Supported assets

Settlement is via EIP-3009 `transferWithAuthorization`, so support is a property of the contract, not a policy choice. Assets are allowlisted rather than auto-detected: a relayer that sponsors gas for any token it is handed is a free gas faucet.

| Token | Network | Address | EIP-3009 | `extra` |
| --- | --- | --- | --- | --- |
| USDC.e | Sepolia | `0x5Eb541ba8A2DD841aF7864c3389162a23ddA8401` | yes | `{ name: "Bridged USDC (Whitechain)", version: "2" }` |
| USDT | Sepolia | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` | yes | `{ name: "Tether USD", version: "1" }` |
| USDC.e | mainnet | `0xF97B9Bf62916f1EB42Dd906a7254603e7b9FC4a7` | yes | `{ name: "Bridged USDC (Whitechain)", version: "2" }` |

Note the two different domain versions. There is no safe default.

### The USDT situation

The two networks are not symmetric, which catches people out:

- **Sepolia USDT is `TetherTokenV2`** and **does** support EIP-3009. Its `TRANSFER_WITH_AUTHORIZATION_TYPEHASH()` returns the canonical `0x7c7c6cdb…1a2267`. If you have read that Whitechain USDT lacks EIP-3009 and therefore needs a Permit2 workaround, that is false for the testnet contract.
- **Mainnet USDT (`0xF95604a4…`) is `TetherToken` V1** and does **not**. It has `permit` and `nonces`, but no `transferWithAuthorization`, no `receiveWithAuthorization`, no `authorizationState` — the typehash call reverts. Its total supply is also `0`. So it cannot be paid gaslessly at all, and is excluded.

```bash
# Sepolia — returns the canonical typehash
cast call 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 \
  "TRANSFER_WITH_AUTHORIZATION_TYPEHASH()(bytes32)" --rpc-url https://rpc.testnet.whitechain.io

# Mainnet — reverts
cast call 0xF95604a4034d8407d3F1256De56C9ae37F299cb8 \
  "TRANSFER_WITH_AUTHORIZATION_TYPEHASH()(bytes32)" --rpc-url https://rpc.whitechain.io
```

## Networks

| | Whitechain mainnet | Whitechain Sepolia |
| --- | --- | --- |
| Chain ID | `1875` | `1874` |
| CAIP-2 | `eip155:1875` | `eip155:1874` |
| RPC | `https://rpc.whitechain.io` | `https://rpc.testnet.whitechain.io` |
| Explorer | `https://explorer.whitechain.io` | `https://explorer.testnet.whitechain.io` |
| Faucet | — | `https://faucet.testnet.whitechain.io` |
| Gas | WBT, 18 dec, 5 gwei min base fee, ~1s blocks | same |

Both are OP Stack L2s settling to Ethereum. Permit2 (`0x0000…78BA3`) and Multicall3 are deployed on both; `x402ExactPermit2Proxy` (`0x402085c2…0001`) is on Sepolia only. We do not use the Permit2 path — every allowlisted asset is natively EIP-3009 — but the deterministic CREATE2 deployer is present on mainnet if someone needs the proxies there.

## Architecture

All the protocol work is in the official libraries. `@x402/core/facilitator` and `@x402/evm/exact/facilitator` handle EIP-712 recovery (including EIP-1271 smart accounts), balance checks, simulation, nonce handling and `settlement_pending` reconciliation. None of it is reimplemented.

```
lib/
  networks.ts          network + asset registry — the only place addresses live
  chain.ts             viem clients per chain, the signer, EIP-712 domain verification
  facilitator.ts       one x402Facilitator per network + logging hooks
  facilitator-http.ts  request parsing and refusal shaping for /verify and /settle
  guards.ts            allowlist, dust floor, rate limits, gas budgets, kill switch
  db.ts                Neon Postgres — the payment log and the budget query
  docs-nav.ts          docs table of contents, and the route manifest

app/
  (facilitator)/       the x402 API. Route group, so these stay at the root:
    verify/            POST /verify
    settle/            POST /settle
    supported/         GET  /supported
    assets/            GET  /assets
    health/            GET  /health
  api/{logs,stats}/    JSON behind the log page
  page.tsx             landing
  logs/                public transaction log
  docs/                MDX renderer + sidebar

content/docs/*.mdx     the documentation itself
db/schema.sql          templated once per network by scripts/migrate.ts
scripts/               migrate, verify-assets, smoke, guards.test
```

The facilitator endpoints live in a route group rather than under `/api` so they
stay at the bare origin, which is what `HTTPFacilitatorClient` expects. The group
separates them from the website without changing a URL.

Two design points worth knowing:

- **One facilitator instance per network.** `FacilitatorEvmSigner` has no chain argument on `readContract`/`writeContract`, so a signer is bound to one chain. Requests dispatch on `paymentPayload.accepted.network`. The same key is used on both, so there is one address to fund — but budgets and kill switches are per network, because mainnet WBT is real money.
- **Gas budgets are database-backed; rate limits are not.** The budget is a `sum(gas_cost_wei)` over today's settlements, so it stays correct no matter how many replicas run. Rate-limit counters are per process — correct for a single instance, which is the intended deployment.

## Guards

The private key is the only thing at risk, and only for gas. Every request runs a preflight before the x402 libraries are touched, in rising order of cost — string comparisons, then in-memory counters, then RPC and database reads. Rejections spend nothing.

| Guard | Default |
| --- | --- |
| Network + asset allowlist, scoped per network | — |
| Mainnet kill switch (`/verify` unaffected) | `MAINNET_ENABLED=false` |
| Dust floor | 0.01 (`10000` base units) |
| Daily gas budget, per network | 1 WBT testnet / 0.5 WBT mainnet |
| Daily gas budget, per merchant | 0.1 / 0.05 WBT |
| Rate limits (IP / payer / merchant / global per minute) | 120 / 30 / 120 / 1200 |
| Per-settlement gas cap | 300,000 |
| Low-balance refusal | below 0.05 WBT |

Operational refusals return `429`/`503` with `Retry-After`; protocol verdicts return `200` with `isValid: false`. Nothing is broadcast either way.

Signatures and authorization nonces are never written to the database — only the metadata the log page shows.

## Database

Neon (or any) Postgres, via `DATABASE_URL`. One table per network, `payments_testnet` and `payments_mainnet`, generated from a single templated `db/schema.sql` so they cannot drift. A unique partial index on `tx_hash` makes the settle-retry path idempotent and stops a retry double-counting gas against the budget.

## Testing

```bash
pnpm typecheck
pnpm test             # guard logic — 14 assertions, no database or RPC needed
pnpm verify-assets    # asset registry vs. both live chains
pnpm smoke            # end-to-end; needs SMOKE_PAYER_PRIVATE_KEY
```

`pnpm smoke` is the one that proves the product. It builds a payment with the same `@x402/evm` client a real agent uses and posts it to `/verify` and `/settle`, then asserts:

- the payer held **zero WBT** before, and still holds exactly zero after — if it moved, gas was not sponsored
- the payer's token balance fell by exactly the authorized amount
- `payTo` received exactly that amount, so the funds went where the signature said
- the facilitator's own WBT balance fell, so it is the one that paid
- `/assets` advertised the EIP-712 domain the signature was actually built with
- the settlement landed in the public log

It needs `SMOKE_PAYER_PRIVATE_KEY` (an account with the stablecoin and no WBT) and `SMOKE_PAY_TO`.

```bash
pnpm smoke -- --network=mainnet --url=https://facilitator.example
```

## Self-hosting

See [docs/self-host](content/docs/self-host.mdx) for the full environment reference. The short version: Node 22+, a Postgres URL, and a funded WBT wallet. Run it as a long-lived Node process (`pnpm build && pnpm start`) behind a reverse proxy — client IP is read from `x-forwarded-for`, so terminate that at a proxy you control or the per-IP limits are decorative.

To add an asset, edit `lib/networks.ts` and run `pnpm verify-assets`; it fails loudly rather than letting a wrong domain reach production.

If you only want the API, delete `app/page.tsx`, `app/docs`, `app/logs` and `components/`. Nothing in `lib/` depends on them.

## License

Apache-2.0.

Whitechain and WhiteBIT are trademarks of their owners. This project is not affiliated with or endorsed by them, Coinbase, Circle, or the x402 Foundation.
