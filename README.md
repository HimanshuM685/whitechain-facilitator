# whitechain-facilitator

An [x402](https://docs.x402.org) v2 facilitator for [Whitechain](https://docs.whitechain.io), plus a documentation site and a public log of every payment it handles.

It lets an HTTP endpoint charge per request, and it pays the gas so the customer does not have to. A payer holding nothing but **USDT** — **zero WBT** — can pay your API. USDT is the only token served; WBT is only ever the gas token, paid by us.

Serves Whitechain Sepolia (`eip155:1874`). Mainnet (`eip155:1875`) is wired up but has no servable asset: mainnet USDT has no EIP-3009 (see below).

## How it works

Your endpoint answers an unpaid request with `402 Payment Required` and the terms. The payer signs an EIP-3009 `TransferWithAuthorization` — a message, not a transaction, so it costs nothing and needs no gas token. Your server hands that signature here; we verify it, simulate it, then submit `transferWithAuthorization` on-chain and pay the WBT fee ourselves.

The stablecoin moves **directly from payer to merchant**. This service never holds funds, and the signature fixes the recipient, the amount, a validity window and a single-use nonce — so the only discretion we have is whether to submit it.

> There is no transaction batching involved. Gasless payments described as "grouping the payer's transaction with the facilitator's" are Algorand's atomic groups — a different model. On an EVM chain there is one transaction, sent by us, authorised by them.

## Quick start

```bash
pnpm install
cp .env.example .env          # fill in FACILITATOR_PRIVATE_KEY and DATABASE_URL
pnpm verify-assets            # proves the asset registry against both chains
pnpm migrate                  # optional: the app creates its tables on first use
pnpm dev
```

Run `verify-assets` first. It checks every allowlisted token's EIP-3009 typehash, decimals, and EIP-712 domain against the token's own `DOMAIN_SEPARATOR()`. It exits non-zero on a mismatch and prints the correct values. Nothing downstream is trustworthy until it passes.

```
Whitechain Sepolia  USDT  0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7
  decimals        ok
  eip-3009        ok (canonical typehash)
  separator       0xcdcfacb6b15c8238b4e5fbb47bdb83b7f83f50a531d264bf9763d2bd1d3d2a25
  domain          ok  { name: "Tether USD", version: "1" }

1/1 assets verified.
```

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /verify` | x402 verification. Read-only, no gas, safe to call freely. |
| `POST /settle` | Submits the authorization on-chain and pays the WBT fee. |
| `GET /supported` | Scheme and network discovery, plus the signer that pays your gas. |
| `GET /assets` | Allowlisted assets per network with their **verified** EIP-712 domains. |
| `GET /health` | Per-network signer balance and block height. `503` when degraded. |
| `GET /api/logs` | The payment log behind `/logs`. |
| `GET /api/stats` | Per-network totals. |

The base URL is the bare origin — no `/api` prefix, no rewrites — because `HTTPFacilitatorClient` builds `${url}/verify`. One URL serves both networks, since x402 carries the network inside the payment payload.

## Using it as a merchant

Standard x402 packages, unmodified — only the facilitator URL is ours:

```ts
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const app = express();

const facilitatorClient = new HTTPFacilitatorClient({ url: "https://your-facilitator.example" });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:1874", new ExactEvmScheme());

app.use(paymentMiddleware({
  "GET /api/report": {
    accepts: {
      scheme: "exact",
      network: "eip155:1874",
      payTo: "0xYourMerchantAddress",
      price: {
        asset: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",   // USDT (Sepolia)
        amount: "10000",                                        // 0.01, six decimals
        extra: { name: "Tether USD", version: "1" },
      },
    },
    description: "One generated report",
  },
}, resourceServer));
```

Other chains keep their own facilitator: pass an array, `new x402ResourceServer([whitechainClient, otherClient])`, and each payment routes to the facilitator that advertises its network. Payers using `@x402/fetch` must opt Whitechain USDT in via `spendControls.allowedAssets`, since it is not in the client's default asset list. Full examples: `content/docs/quickstart-merchant.mdx` and `quickstart-agent.mdx`.

**The price is written out longhand for a reason.** Neither Whitechain network is in `@x402/evm`'s `DEFAULT_ASSETS`, so the usual `price: "$0.01"` shorthand has no asset to resolve to and throws. You supply the three fields it would have filled in — and `extra` is the one that bites: it is the token's EIP-712 domain, and if it is wrong by a character every signature recovers to a different address and fails with no transaction and no revert to debug. Fetch verified values from `/assets` rather than guessing.

## Supported assets

Settlement is via EIP-3009 `transferWithAuthorization`, so support is a property of the contract, not a policy choice. Assets are allowlisted rather than auto-detected: a relayer that sponsors gas for any token it is handed is a free gas faucet.

| Token | Network | Address | EIP-3009 | `extra` |
| --- | --- | --- | --- | --- |
| USDT | Sepolia | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` | yes | `{ name: "Tether USD", version: "1" }` |

USDT is the only stablecoin this facilitator sponsors. Mainnet has no entry, for the reason below.

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

Both are OP Stack L2s settling to Ethereum. Permit2 (`0x0000…78BA3`) and Multicall3 are deployed on both; `x402ExactPermit2Proxy` (`0x402085c2…0001`) is on Sepolia only. We do not use the Permit2 path — Sepolia USDT is natively EIP-3009 — but the deterministic CREATE2 deployer is present on mainnet if someone needs the proxies there.

## Architecture

All the protocol work is in the official libraries. `@x402/core/facilitator` and `@x402/evm/exact/facilitator` handle EIP-712 recovery (including EIP-1271 smart accounts), balance checks, simulation, nonce handling and `settlement_pending` reconciliation. None of it is reimplemented.

```
lib/
  networks.ts          network + asset registry — the only place addresses live
  chain.ts             viem clients per chain, the signer, EIP-712 domain verification
  facilitator.ts       one x402Facilitator per network + logging hooks
  facilitator-http.ts  request parsing and refusal shaping for /verify and /settle
  guards.ts            allowlist, dust floor, rate limits, signer balance floor, kill switch
  db.ts                Neon Postgres — the public payment log
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
lib/schema.ts          log table DDL, applied automatically on first use
scripts/               migrate, verify-assets, smoke, guards.test
```

The facilitator endpoints live in a route group rather than under `/api` so they
stay at the bare origin, which is what `HTTPFacilitatorClient` expects. The group
separates them from the website without changing a URL.

Two design points worth knowing:

- **One facilitator instance per network.** `FacilitatorEvmSigner` has no chain argument on `readContract`/`writeContract`, so a signer is bound to one chain. Requests dispatch on `paymentPayload.accepted.network`. The same key is used on both, so there is one address to fund — but the kill switch is per network, because mainnet WBT is real money.
- **No gas budget.** Spend is capped only by the signer's WBT balance. Rate-limit counters are per process: exact on a single instance, looser on serverless. See [self-host](content/docs/self-host.mdx#deploying).

## Guards

The private key is the only thing at risk, and only for gas. Every request runs a preflight before the x402 libraries are touched, in rising order of cost — string comparisons, then in-memory counters, then RPC and database reads. Rejections spend nothing.

| Guard | Default |
| --- | --- |
| Network + asset allowlist, scoped per network | — |
| Mainnet kill switch (`/verify` unaffected) | `MAINNET_ENABLED=false` |
| Dust floor | 0.01 (`10000` base units) |
| Rate limits (IP / payer / merchant / global per minute) | 120 / 30 / 120 / 1200 |
| Per-settlement gas cap | 300,000 |
| Low-balance refusal | below 0.05 WBT |

Operational refusals return `429`/`503` with `Retry-After`; protocol verdicts return `200` with `isValid: false`. Nothing is broadcast either way.

Signatures and authorization nonces are never written to the database — only the metadata the log page shows.

## Database

Neon (or any) Postgres, via `DATABASE_URL`. One table per network, `payments_testnet` and `payments_mainnet`, generated from one template in `lib/schema.ts` so they cannot drift, and created automatically on first use. A unique partial index on `tx_hash` makes the settle-retry path idempotent and stops a retry logging the same transaction twice.

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

See [docs/self-host](content/docs/self-host.mdx) for the full environment reference. The short version: Node 22+, a Postgres URL, and a funded WBT wallet.

Either deployment works:

- **A long-lived process** (Railway, Fly, a VM): `pnpm build && pnpm start` behind a reverse proxy. Rate limits are exactly what you configured. This is what the defaults assume.
- **Vercel / serverless**: needs `vercel.json` with `{ "framework": "nextjs" }`. Concurrent instances each hold their own rate-limit counters, so per-IP limits run looser than configured — spend is capped only by the signer's WBT balance.

To add an asset, edit `lib/networks.ts` and run `pnpm verify-assets`; it fails loudly rather than letting a wrong domain reach production.

If you only want the API, delete `app/page.tsx`, `app/docs`, `app/logs` and `components/`. Nothing in `lib/` depends on them.

## License

Apache-2.0.

Whitechain and WhiteBIT are trademarks of their owners. This project is not affiliated with or endorsed by them, Coinbase, Circle, or the x402 Foundation.
