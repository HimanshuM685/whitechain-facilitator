-- One payment-log table per network. Applied once per entry in NETWORKS, with
-- {{table}} substituted from `NETWORKS[net].table` by scripts/migrate.ts.
--
-- Templated rather than written out twice on purpose: the stats and log queries
-- assume both tables have an identical shape, so they must not be able to drift.
--
-- Nothing replayable is stored: no signatures, no authorization nonces.

create table if not exists {{table}} (
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
);

create index if not exists {{table}}_created_idx on {{table}} (created_at desc);
create index if not exists {{table}}_payer_idx on {{table}} (payer);
create index if not exists {{table}}_payto_idx on {{table}} (pay_to);

-- Makes the settle-retry path idempotent for free: a replica that re-logs an
-- already-broadcast transaction hits this instead of double-counting gas.
create unique index if not exists {{table}}_tx_idx on {{table}} (tx_hash)
  where tx_hash is not null;

-- Budget checks scan today's settles only; this keeps that a narrow index scan.
create index if not exists {{table}}_settle_day_idx on {{table}} (created_at desc)
  where kind = 'settle' and ok;
