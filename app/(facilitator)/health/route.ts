import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { facilitatorAccount, publicClientFor } from "@/lib/chain";
import { dbHealthy, gasSpentTodayWei } from "@/lib/db";
import { config } from "@/lib/guards";
import { NETWORK_KEYS, NETWORKS, type NetworkKey } from "@/lib/networks";

export const dynamic = "force-dynamic";

/** A typical EIP-3009 settle costs ~85k gas; used to turn WBT into "settles left". */
const TYPICAL_SETTLE_GAS = 85_000n;

type NetworkHealth = {
  network: NetworkKey;
  caip2: string;
  status: "ok" | "degraded" | "disabled";
  detail?: string;
  blockNumber?: string;
  balanceWbt?: string;
  gasPriceGwei?: string;
  budget?: { dailyWbt: string; spentTodayWbt: string; remainingWbt: string };
  estimatedSettlesLeft?: number;
};

/** Error text with any URL stripped — RPC endpoints can carry API keys. */
const safeMessage = (error: unknown): string =>
  ((error as Error)?.message ?? String(error)).replace(/https?:\/\/\S+/g, "<url>").slice(0, 160);

async function networkHealth(net: NetworkKey, signer: `0x${string}`): Promise<NetworkHealth> {
  const base = { network: net, caip2: NETWORKS[net].caip2 } as const;

  if (net === "mainnet" && !config.mainnetEnabled) {
    return { ...base, status: "disabled", detail: "MAINNET_ENABLED is not true; /verify still works." };
  }

  // The chain reads and the budget read fail for unrelated reasons, so they are
  // settled separately — a database outage reported as "RPC unreachable" sends
  // whoever is debugging it in exactly the wrong direction.
  const client = publicClientFor(net);
  const [chainState, budgetState] = await Promise.allSettled([
    Promise.all([
      client.getBalance({ address: signer }),
      client.getBlockNumber(),
      client.getGasPrice(),
    ]),
    gasSpentTodayWei(net),
  ]);

  if (chainState.status === "rejected") {
    return { ...base, status: "degraded", detail: `RPC unreachable: ${safeMessage(chainState.reason)}` };
  }

  const [balance, blockNumber, gasPrice] = chainState.value;
  const chainFacts = {
    blockNumber: blockNumber.toString(),
    balanceWbt: formatEther(balance),
    gasPriceGwei: (Number(gasPrice) / 1e9).toFixed(2),
  };

  if (budgetState.status === "rejected") {
    return {
      ...base,
      ...chainFacts,
      status: "degraded",
      detail: `Budget unreadable (database): ${safeMessage(budgetState.reason)}`,
    };
  }

  const spentToday = budgetState.value;
  const daily = config.gasBudgetDailyWei[net];
  const remaining = daily > spentToday ? daily - spentToday : 0n;
  // Whichever runs out first — our wallet or today's budget — caps throughput.
  const spendable = balance < remaining ? balance : remaining;
  const perSettle = gasPrice * TYPICAL_SETTLE_GAS;
  const lowBalance = balance < config.minSignerBalanceWei;

  return {
    ...base,
    ...chainFacts,
    status: lowBalance || remaining === 0n ? "degraded" : "ok",
    detail: lowBalance
      ? "Signer WBT balance is below the operating floor."
      : remaining === 0n
        ? "Daily gas budget is spent; resets at 00:00 UTC."
        : undefined,
    budget: {
      dailyWbt: formatEther(daily),
      spentTodayWbt: formatEther(spentToday),
      remainingWbt: formatEther(remaining),
    },
    estimatedSettlesLeft: perSettle > 0n ? Number(spendable / perSettle) : 0,
  };
}

/**
 * GET /health — operational state per network. Safe to expose publicly: it
 * reveals the signer address (which is on-chain anyway) and balances, never a key.
 */
export async function GET() {
  let signer: `0x${string}`;
  try {
    signer = facilitatorAccount().address;
  } catch (error) {
    return NextResponse.json(
      { status: "degraded", detail: (error as Error).message, networks: [] },
      { status: 503 },
    );
  }

  const [networks, db] = await Promise.all([
    Promise.all(NETWORK_KEYS.map((net) => networkHealth(net, signer))),
    dbHealthy(),
  ]);

  const degraded = !db || networks.some((n) => n.status === "degraded");
  return NextResponse.json(
    { status: degraded ? "degraded" : "ok", signer, db: db ? "ok" : "unreachable", networks },
    { status: degraded ? 503 : 200 },
  );
}
