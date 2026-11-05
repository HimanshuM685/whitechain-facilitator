import { NextResponse } from "next/server";
import { formatEther, formatUnits } from "viem";
import { statsFor } from "@/lib/db";
import { NETWORK_KEYS, NETWORKS } from "@/lib/networks";

export const dynamic = "force-dynamic";

/**
 * GET /api/stats — totals per network for the landing page.
 *
 * Volume is summed in base units across that network's assets, which all use 6
 * decimals, so one formatted figure is accurate. If an asset with different
 * decimals is ever allowlisted, this needs to group by asset first.
 */
export async function GET() {
  try {
    const networks = await Promise.all(
      NETWORK_KEYS.map(async (key) => {
        const net = NETWORKS[key];
        const stats = await statsFor(key);
        const decimals = net.assets[0]?.decimals ?? 6;
        return {
          network: key,
          caip2: net.caip2,
          name: net.name,
          settled: stats.settled,
          failed: stats.failed,
          volume: formatUnits(BigInt(stats.volume), decimals),
          gasSponsoredWbt: formatEther(BigInt(stats.gasSponsoredWei)),
          uniquePayers: stats.uniquePayers,
          uniqueMerchants: stats.uniqueMerchants,
          lastSettledAt: stats.lastSettledAt,
        };
      }),
    );
    return NextResponse.json({ networks });
  } catch (error) {
    console.error("[api/stats]", (error as Error).message);
    return NextResponse.json({ error: "db_unavailable", message: "Could not read stats." }, { status: 503 });
  }
}
