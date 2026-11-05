/**
 * Payment-log DDL, one table per network. Kept in TypeScript (not a .sql file)
 * so it ships inside the server bundle: the app applies it itself on first use,
 * and `pnpm migrate` applies the same statements by hand.
 *
 * Templated per network on purpose: the stats and log queries assume both
 * tables have an identical shape, so they must not be able to drift.
 *
 * Nothing replayable is stored: no signatures, no authorization nonces.
 * Every statement is idempotent, so re-running is always safe.
 */

export const schemaFor = (table: string): string[] => [
  `create table if not exists ${table} (
    id            bigserial primary key,
    created_at    timestamptz not null default now(),
    kind          text        not null check (kind in ('verify', 'settle')),
    ok            boolean     not null,
    error_reason  text,
    network       text        not null,
    scheme        text        not null,
    asset         text,
    asset_symbol  text,
    payer         text,
    pay_to        text,
    amount        numeric(78, 0),
    resource      text,
    tx_hash       text,
    gas_used      numeric(78, 0),
    gas_cost_wei  numeric(78, 0),
    latency_ms    integer
  )`,
  // Keyset pagination for the public log orders by (created_at, id).
  `create index if not exists ${table}_created_id_idx on ${table} (created_at desc, id desc)`,
  `create index if not exists ${table}_payer_idx on ${table} (payer)`,
  `create index if not exists ${table}_payto_idx on ${table} (pay_to)`,
  // A retried settle that re-logs an already-broadcast transaction hits this
  // instead of producing a duplicate row.
  `create unique index if not exists ${table}_tx_idx on ${table} (tx_hash) where tx_hash is not null`,
  // Superseded indexes from earlier versions.
  `drop index if exists ${table}_created_idx`,
  `drop index if exists ${table}_settle_day_idx`,
  `drop index if exists ${table}_settle_spend_idx`,
];
