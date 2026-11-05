import { NextResponse, type NextRequest } from "next/server";
import { x402ResourceServer, type RouteConfig } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { inProcessFacilitatorClient } from "@/lib/facilitator";
import { config } from "@/lib/guards";
import { NETWORK_KEYS, NETWORKS } from "@/lib/networks";
import { withX402 } from "@x402/next";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/demo/joke";

/** Where the merchant side of this demo sends payments. */
const PAY_TO = process.env.DEMO_MERCHANT_ADDRESS ?? "0x000000000000000000000000000000000000dEaD";

/**
 * One payment option per allowlisted asset, across every enabled network — so a
 * single 402 response lets a testnet agent and a mainnet agent each pay with
 * whatever they hold. Mainnet options disappear when `MAINNET_ENABLED` is off,
 * rather than being advertised and then refused at settle time.
 *
 * `price` is given as an explicit `AssetAmount`, not `"$0.01"`: neither Whitechain
 * network is in @x402/evm's DEFAULT_ASSETS, so the dollar shorthand has no asset
 * to resolve to. `extra` carries the token's real EIP-712 domain, verified against
 * its own DOMAIN_SEPARATOR() by `pnpm verify-assets`.
 */
function accepts(): RouteConfig["accepts"] {
  return NETWORK_KEYS.filter((net) => net === "testnet" || config.mainnetEnabled).flatMap((net) =>
    NETWORKS[net].assets.map((asset) => ({
      scheme: "exact",
      network: NETWORKS[net].caip2,
      payTo: PAY_TO,
      maxTimeoutSeconds: 60,
      price: {
        asset: asset.address,
        amount: "10000", // 0.01 at 6 decimals
        extra: asset.domain,
      },
    })),
  );
}

// Talks to this process rather than looping back over HTTP to our own /verify.
const server = new x402ResourceServer(inProcessFacilitatorClient());

for (const net of NETWORK_KEYS) {
  server.register(NETWORKS[net].caip2, new ExactEvmScheme());
}

const JOKES = [
  "A payment walks into a bar and orders a round. The bartender says: that'll be 402.",
  "Why did the agent refuse the invoice? It was waiting on a facilitator.",
  "Gas fees are like a cover charge: cheaper when someone else is paying.",
  "I told my wallet to be more assertive. Now it signs everything.",
];

async function handler(request: NextRequest) {
  return NextResponse.json({
    joke: JOKES[Math.floor(Math.random() * JOKES.length)],
    paidAt: new Date().toISOString(),
    note: "You just paid for this over x402 without holding any WBT.",
    network: request.nextUrl.searchParams.get("network") ?? undefined,
  });
}

export const GET = withX402(
  handler,
  {
    [ROUTE]: {
      accepts: accepts(),
      description: "A joke, for 0.01 USDC.e — the smallest honest demonstration of a gasless x402 payment.",
      mimeType: "application/json",
      serviceName: "Whitechain x402 Facilitator demo",
    },
  },
  server,
);
