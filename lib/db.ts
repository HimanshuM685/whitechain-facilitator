/**
 * Neon Postgres access for the payment log (public log only; settlement does not depend on it). One table per network, named in
 * lib/networks.ts. Raw SQL via the Neon HTTP driver — no ORM for four queries.
 *
 * Table names are interpolated as identifiers, which is only safe because they
 * come from the `NETWORKS` registry (a closed set of literals) and never from
 * request input. `tableFor` is the only place that mapping happens.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { NETWORK_KEYS, NETWORKS, type NetworkKey } from "./networks";
import { schemaFor } from "./schema";

let cached: NeonQueryFunction<false, false> | undefined;

export function db(): NeonQueryFunction<false, false> {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    cached = neon(url);
  }
  return cached;
}

let schemaReady: Promise<void> | undefined;

/**
 * Creates the log tables if they are missing, once per process. Means a fresh
 * database works without anyone remembering `pnpm migrate`. A failure is not
 * cached, so the next request retries.
 */
export function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    for (const net of NETWORK_KEYS) {
      for (const statement of schemaFor(tableFor(net))) await db().query(statement);
    }
  })().catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

export const tableFor = (net: NetworkKey): string => NETWORKS[net].table;

export type PaymentRow = {
  id: string;
  created_at: string;
  kind: "verify" | "settle";
  ok: boolean;
  error_reason: string | null;
  network: string;
  scheme: string;
  asset: string | null;
  asset_symbol: string | null;
  payer: string | null;
  pay_to: string | null;
  amount: string | null;
  resource: string | null;
  tx_hash: string | null;
  gas_used: string | null;
  gas_cost_wei: string | null;
  latency_ms: number | null;
  /** Opaque pagination cursor; pass back as `before`. */
  cursor: string;
};

export type PaymentInsert = Omit<PaymentRow, "id" | "created_at" | "cursor">;

/**
 * Keyset cursor for the log: `<created_at as Postgres text>_<id>`. The
 * timestamp alone is not unique (rows can share a microsecond, and a JS Date
 * would truncate it to milliseconds anyway), so `id` breaks ties. A bare
 * timestamp is still accepted from older clients.
 */
export function parseCursor(before: string): { ts: string; id: string | null } {
  const cut = before.lastIndexOf("_");
  const id = cut === -1 ? "" : before.slice(cut + 1);
  return /^\d+$/.test(id) ? { ts: before.slice(0, cut), id } : { ts: before, id: null };
}

/**
 * Appends one log entry. Deliberately never throws: a logging failure must not
 * turn a settled on-chain payment into an HTTP error for the merchant.
 *
 * Upserts on the unique partial index on tx_hash: a settle first logged as
 * `settlement_pending` (ok=false) and later confirmed by a retry with the same
 * hash updates that row instead of being dropped, so the success is recorded.
 */
export async function logPayment(net: NetworkKey, row: PaymentInsert): Promise<void> {
  const table = tableFor(net);
  try {
    await ensureSchema();
    await db().query(
      `insert into ${table}
         (kind, ok, error_reason, network, scheme, asset, asset_symbol, payer, pay_to,
          amount, resource, tx_hash, gas_used, gas_cost_wei, latency_ms)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (tx_hash) where tx_hash is not null do update set
         ok           = excluded.ok or ${table}.ok,
         error_reason = case when excluded.ok or ${table}.ok then null else excluded.error_reason end,
         gas_used     = coalesce(excluded.gas_used, ${table}.gas_used),
         gas_cost_wei = coalesce(excluded.gas_cost_wei, ${table}.gas_cost_wei),
         latency_ms   = coalesce(excluded.latency_ms, ${table}.latency_ms)`,
      [
        row.kind,
        row.ok,
        row.error_reason,
        row.network,
        row.scheme,
        row.asset,
        row.asset_symbol,
        row.payer,
        row.pay_to,
        row.amount,
        row.resource,
        row.tx_hash,
        row.gas_used,
        row.gas_cost_wei,
        row.latency_ms,
      ],
    );
  } catch (error) {
    console.error(`[db] failed to log ${row.kind} on ${net}:`, (error as Error).message);
  }
}

export type LogQuery = {
  net: NetworkKey;
  limit: number;
  before?: string;
  payer?: string;
  payTo?: string;
  /**
   * Match an address in either role. This is what the log page's single search
   * box wants — combining `payer` and `payTo` instead would require the same
   * address to be both sides of the payment, which matches nothing.
   */
  address?: string;
};

export async function listPayments(query: LogQuery): Promise<PaymentRow[]> {
  await ensureSchema();
  const table = tableFor(query.net);
  // Settlements only. Older deployments also logged verify attempts; this hides them.
  const clauses: string[] = [`kind = 'settle'`];
  const params: unknown[] = [];

  if (query.before) {
    const { ts, id } = parseCursor(query.before);
    params.push(ts);
    if (id === null) {
      clauses.push(`created_at < $${params.length}::timestamptz`);
    } else {
      params.push(id);
      clauses.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::bigint)`);
    }
  }
  if (query.address) {
    params.push(query.address);
    clauses.push(`(lower(payer) = lower($${params.length}) or lower(pay_to) = lower($${params.length}))`);
  }
  if (query.payer) {
    params.push(query.payer);
    clauses.push(`lower(payer) = lower($${params.length})`);
  }
  if (query.payTo) {
    params.push(query.payTo);
    clauses.push(`lower(pay_to) = lower($${params.length})`);
  }

  params.push(Math.min(Math.max(query.limit, 1), 200));
  const where = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";

  return (await db().query(
    `select id::text, created_at, kind, ok, error_reason, network, scheme, asset, asset_symbol,
            payer, pay_to, amount::text, resource, tx_hash, gas_used::text, gas_cost_wei::text, latency_ms,
            created_at::text || '_' || id::text as cursor
       from ${table}
       ${where}
      order by created_at desc, id desc
      limit $${params.length}`,
    params,
  )) as PaymentRow[];
}

export type NetworkStats = {
  settled: number;
  failed: number;
  volume: string;
  gasSponsoredWei: string;
  uniquePayers: number;
  uniqueMerchants: number;
  lastSettledAt: string | null;
};

export async function statsFor(net: NetworkKey): Promise<NetworkStats> {
  await ensureSchema();
  const table = tableFor(net);
  const rows = (await db().query(
    `select
       count(*) filter (where kind = 'settle' and ok)::int        as settled,
       count(*) filter (where kind = 'settle' and not ok)::int    as failed,
       coalesce(sum(amount) filter (where kind = 'settle' and ok), 0)::text       as volume,
       coalesce(sum(gas_cost_wei) filter (where kind = 'settle'), 0)::text        as gas_sponsored_wei,
       count(distinct payer) filter (where kind = 'settle' and ok)::int  as unique_payers,
       count(distinct pay_to) filter (where kind = 'settle' and ok)::int as unique_merchants,
       max(created_at) filter (where kind = 'settle' and ok)             as last_settled_at
     from ${table}`,
  )) as Record<string, unknown>[];

  const r = rows[0] ?? {};
  return {
    settled: Number(r.settled ?? 0),
    failed: Number(r.failed ?? 0),
    volume: String(r.volume ?? "0"),
    gasSponsoredWei: String(r.gas_sponsored_wei ?? "0"),
    uniquePayers: Number(r.unique_payers ?? 0),
    uniqueMerchants: Number(r.unique_merchants ?? 0),
    lastSettledAt: (r.last_settled_at as string | null) ?? null,
  };
}

export async function dbHealthy(): Promise<boolean> {
  try {
    await db().query("select 1");
    return true;
  } catch {
    return false;
  }
}
