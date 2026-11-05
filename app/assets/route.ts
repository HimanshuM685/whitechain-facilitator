import { NextResponse } from "next/server";
import { NETWORK_KEYS, NETWORKS } from "@/lib/networks";

export const dynamic = "force-dynamic";

/**
 * GET /assets — the copy-paste answer to "what do I put in `accepts`?".
 *
 * Neither Whitechain network is in @x402/evm's DEFAULT_ASSETS, so the `price: "$0.01"`
 * shorthand does not resolve and merchants must supply `asset`, `amount` and
 * `extra` themselves. Getting `extra` wrong fails every signature with no on-chain
 * trace, so the values served here are the ones proven against each token's
 * `DOMAIN_SEPARATOR()` by `pnpm verify-assets`.
 */
export async function GET() {
  return NextResponse.json({
    networks: NETWORK_KEYS.map((key) => {
      const net = NETWORKS[key];
      return {
        network: key,
        caip2: net.caip2,
        chainId: net.chainId,
        name: net.name,
        explorer: net.explorer,
        assets: net.assets.map((asset) => ({
          symbol: asset.symbol,
          label: asset.label,
          address: asset.address,
          decimals: asset.decimals,
          // Drop straight into `accepts` alongside scheme/network/payTo/amount.
          extra: asset.domain,
          domainSeparator: asset.domainSeparator,
        })),
      };
    }),
  });
}
