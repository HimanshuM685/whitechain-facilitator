import { NextResponse, type NextRequest } from "next/server";
import { formatEther, formatUnits } from "viem";
import { isStatsRange, statsFor, type StatsWindow } from "@/lib/db";
import { NETWORK_KEYS, NETWORKS } from "@/lib/networks";

export const dynamic = "force-dynamic";

// USDT is the only asset and uses 6 decimals, so one formatted volume is exact.
const DECIMALS = 6;

const format = (w: StatsWindow) => ({
  settled: w.settled,
  failed: w.failed,
  onchainTxs: w.onchainTxs,
  volume: formatUnits(BigInt(w.volume), DECIMALS),
  gasSponsoredWbt: formatEther(BigInt(w.gasSponsoredWei)),
  uniquePayers: w.uniquePayers,
  uniqueMerchants: w.uniqueMerchants,
  avgSettleMs: w.avgSettleMs,
});

/**
 * GET /api/stats?range=24h|7d|30d|all — settlement totals per network.
 * `previous` is the equal-length window before `current` (null for "all").
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("range") ?? "all";
  const range = isStatsRange(raw) ? raw : "all";

  try {
    const networks = await Promise.all(
      NETWORK_KEYS.map(async (key) => {
        const stats = await statsFor(key, range);
        return {
          network: key,
          caip2: NETWORKS[key].caip2,
          name: NETWORKS[key].name,
          range,
          current: format(stats.current),
          previous: stats.previous ? format(stats.previous) : null,
          lastSettledAt: stats.lastSettledAt,
        };
      }),
    );
    return NextResponse.json({ range, networks });
  } catch (error) {
    console.error("[api/stats]", (error as Error).message);
    return NextResponse.json({ error: "db_unavailable", message: "Could not read stats." }, { status: 503 });
  }
}
