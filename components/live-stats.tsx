"use client";

import { useEffect, useState } from "react";
import { useNetwork } from "./network-provider";

type NetworkStat = {
  network: string;
  settled: number;
  failed: number;
  volume: string;
  gasSponsoredWbt: string;
  uniquePayers: number;
  uniqueMerchants: number;
  lastSettledAt: string | null;
};

const trim = (value: string, places: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(places) : value;
};

/** Headline counters for the selected network. Empty-but-healthy reads as zeros. */
export function LiveStats() {
  const { key, net } = useNetwork();
  const [stats, setStats] = useState<NetworkStat | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/stats", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { networks: NetworkStat[] };
        if (!cancelled) {
          setStats(body.networks.find((n) => n.network === key) ?? null);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void load();
    const timer = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key]);

  const cells: { label: string; value: string }[] = [
    { label: "Payments settled", value: stats ? stats.settled.toLocaleString() : "—" },
    { label: `Volume (${net.assets[0]?.symbol ?? "USDC.e"})`, value: stats ? trim(stats.volume, 2) : "—" },
    { label: "WBT gas sponsored", value: stats ? trim(stats.gasSponsoredWbt, 5) : "—" },
    { label: "Unique payers", value: stats ? stats.uniquePayers.toLocaleString() : "—" },
  ];

  return (
    <div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink-line bg-ink-line sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="bg-ink-raised px-4 py-4">
            <dd className="font-mono text-2xl tracking-tight text-chalk">{cell.value}</dd>
            <dt className="mt-1 text-xs text-chalk-dim">{cell.label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-chalk-dim">
        {error
          ? "Stats unavailable — the log database is unreachable."
          : `Live from the ${net.name} payment log, refreshed every 15s.`}
      </p>
    </div>
  );
}
