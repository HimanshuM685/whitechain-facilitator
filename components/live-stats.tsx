"use client";

import { useEffect, useState } from "react";
import { useNetwork } from "./network-provider";

type Window = {
  settled: number;
  failed: number;
  onchainTxs: number;
  volume: string;
  gasSponsoredWbt: string;
  uniquePayers: number;
  uniqueMerchants: number;
  avgSettleMs: number | null;
};

type NetworkStat = {
  network: string;
  current: Window;
  previous: Window | null;
  lastSettledAt: string | null;
};

const RANGES = [
  { key: "24h", label: "24H", period: "last 24 hours" },
  { key: "7d", label: "7D", period: "last 7 days" },
  { key: "30d", label: "30D", period: "last 30 days" },
  { key: "all", label: "ALL", period: "all time" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const count = (n: number) => (n < 10_000 ? n.toLocaleString("en-US") : compact.format(n));

const usd = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n < 10_000 ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${compact.format(n)}`;
};

const seconds = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`);

const wbt = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(n < 1 ? 5 : 2) : v;
};

/** Percentage change against the previous window; null when not comparable. */
function change(now: number, before: number | undefined): number | null {
  if (before === undefined || before === 0) return null;
  return ((now - before) / before) * 100;
}

function Delta({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct === null || !Number.isFinite(pct)) return <span className="text-chalk-dim">—</span>;
  const up = pct >= 0;
  // For settle time, going down is the good direction.
  const good = invert ? !up : up;
  return (
    <span className={good ? "text-mainnet" : "text-danger"}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/** Headline dashboard for the selected network, read live from the settlement log. */
export function LiveStats() {
  const { key, net } = useNetwork();
  const [range, setRange] = useState<RangeKey>("all");
  const [stats, setStats] = useState<NetworkStat | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/stats?range=${range}`, { cache: "no-store" });
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
  }, [key, range]);

  const period = RANGES.find((r) => r.key === range)!.period;
  const cur = stats?.current;
  const prev = stats?.previous ?? undefined;

  const tiles: { label: string; value: string; pct: number | null; invert?: boolean; note?: string }[] = [
    {
      label: "Settled volume",
      value: cur ? usd(cur.volume) : "—",
      pct: cur ? change(Number(cur.volume), prev && Number(prev.volume)) : null,
      note: "USDT",
    },
    { label: "Settlements", value: cur ? count(cur.settled) : "—", pct: cur ? change(cur.settled, prev?.settled) : null },
    {
      label: "On-chain transactions",
      value: cur ? count(cur.onchainTxs) : "—",
      pct: cur ? change(cur.onchainTxs, prev?.onchainTxs) : null,
    },
    {
      label: "Unique payers",
      value: cur ? count(cur.uniquePayers) : "—",
      pct: cur ? change(cur.uniquePayers, prev?.uniquePayers) : null,
    },
    {
      label: "Avg settle time",
      value: cur ? seconds(cur.avgSettleMs) : "—",
      pct: cur?.avgSettleMs != null ? change(cur.avgSettleMs, prev?.avgSettleMs ?? undefined) : null,
      invert: true,
      note: "submit to confirmed",
    },
    {
      label: "Gas sponsored",
      value: cur ? wbt(cur.gasSponsoredWbt) : "—",
      pct: cur ? change(Number(cur.gasSponsoredWbt), prev && Number(prev.gasSponsoredWbt)) : null,
      note: "WBT paid by us",
    },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-mono text-xs tracking-wide text-chalk-dim uppercase">{net.name} · settlements</h2>
        <div
          role="radiogroup"
          aria-label="Time range"
          className="ml-auto flex items-center gap-0.5 rounded-lg border border-ink-line bg-ink-raised p-0.5"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="radio"
              aria-checked={range === r.key}
              onClick={() => setRange(r.key)}
              className={[
                "rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
                range === r.key ? "bg-ink text-accent" : "text-chalk-dim hover:text-chalk",
              ].join(" ")}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink-line bg-ink-line sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col bg-ink-raised px-4 py-4">
            <dt className="text-xs text-chalk-dim">{tile.label}</dt>
            <dd className="mt-2 font-mono text-2xl tracking-tight text-chalk">{tile.value}</dd>
            <dd className="mt-2 flex items-center justify-between gap-2 font-mono text-[11px]">
              {range === "all" ? <span className="text-chalk-dim">—</span> : <Delta pct={tile.pct} invert={tile.invert} />}
              <span className="text-chalk-dim">{period}</span>
            </dd>
            {tile.note && <dd className="mt-1 text-[11px] text-chalk-dim">{tile.note}</dd>}
          </div>
        ))}
      </dl>

      <p className="mt-2 text-xs text-chalk-dim">
        {error
          ? "Stats unavailable — the log database is unreachable."
          : `Live from the ${net.name} settlement log, refreshed every 15s.${
              range !== "all" ? " Change is against the previous equal period." : ""
            }`}
      </p>
    </div>
  );
}
