/**
 * Checks on the refusal logic — the code that decides whether we spend money.
 *
 * Runs without a database or RPC: every case here is decided before `preflight`
 * reaches the budget reads, which is itself part of what is being asserted
 * (cheap checks first, so a rejected request costs nothing).
 *
 *   pnpm test
 */

import assert from "node:assert/strict";

// Set before importing lib/guards — its `config` is read from env at module load.
process.env.MIN_AMOUNT_BASE_UNITS = "10000";
process.env.MAINNET_ENABLED = "false";
process.env.RATE_LIMIT_IP_PER_MIN = "3";
process.env.RATE_LIMIT_PAYER_PER_MIN = "1000";
process.env.RATE_LIMIT_PAYTO_PER_MIN = "1000";
process.env.RATE_LIMIT_GLOBAL_PER_MIN = "1000";

const { preflight, resetRateLimits, clientIp } = await import("../lib/guards");
const { NETWORKS, findAsset } = await import("../lib/networks");

const USDC_TESTNET = NETWORKS.testnet.assets.find((a) => a.symbol === "USDC.e")!;
const USDC_MAINNET = NETWORKS.mainnet.assets.find((a) => a.symbol === "USDC.e")!;
const MERCHANT = "0x1111111111111111111111111111111111111111";

const base = {
  net: "testnet" as const,
  phase: "verify" as const,
  ip: "203.0.113.1",
  scheme: "exact",
  network: NETWORKS.testnet.caip2,
  asset: USDC_TESTNET.address,
  amount: "10000",
  payTo: MERCHANT,
};

let passed = 0;
async function check(name: string, run: () => Promise<void> | void) {
  await run();
  passed += 1;
  console.log(`  ok  ${name}`);
}

resetRateLimits();

await check("a well-formed testnet payment passes", async () => {
  const result = await preflight({ ...base, ip: "198.51.100.1" });
  assert.equal(result.kind, "ok");
  assert.equal(result.kind === "ok" && result.asset.symbol, "USDC.e");
});

await check("mixed-case asset addresses still match", async () => {
  const result = await preflight({ ...base, ip: "198.51.100.2", asset: USDC_TESTNET.address.toUpperCase() });
  assert.equal(result.kind, "ok");
});

await check("an unknown asset is rejected", async () => {
  const result = await preflight({
    ...base,
    ip: "198.51.100.3",
    asset: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  });
  assert.equal(result.kind, "reject");
  assert.equal(result.kind === "reject" && result.reason, "unsupported_asset");
});

// The cross-network case is the interesting one: both addresses are allowlisted
// somewhere, so this only fails if the lookup is scoped per network.
await check("a mainnet asset presented as a testnet payment is rejected", async () => {
  const result = await preflight({ ...base, ip: "198.51.100.4", asset: USDC_MAINNET.address });
  assert.equal(result.kind, "reject");
  assert.equal(result.kind === "reject" && result.reason, "unsupported_asset");
  // Sanity: it really is allowlisted on its own network.
  assert.ok(findAsset("mainnet", USDC_MAINNET.address));
  assert.equal(findAsset("testnet", USDC_MAINNET.address), undefined);
});

await check("a mismatched network identifier is rejected", async () => {
  const result = await preflight({ ...base, ip: "198.51.100.5", network: "eip155:8453" });
  assert.equal(result.kind, "reject");
  assert.equal(result.kind === "reject" && result.reason, "unsupported_network");
});

await check("a scheme other than exact is rejected", async () => {
  const result = await preflight({ ...base, ip: "198.51.100.6", scheme: "upto" });
  assert.equal(result.kind, "reject");
  assert.equal(result.kind === "reject" && result.reason, "unsupported_scheme");
});

await check("dust below the floor is rejected", async () => {
  const result = await preflight({ ...base, ip: "198.51.100.7", amount: "9999" });
  assert.equal(result.kind, "reject");
  assert.equal(result.kind === "reject" && result.reason, "amount_below_minimum");
});

await check("exactly the floor is accepted", async () => {
  const result = await preflight({ ...base, ip: "198.51.100.8", amount: "10000" });
  assert.equal(result.kind, "ok");
});

await check("a non-integer amount is rejected", async () => {
  const result = await preflight({ ...base, ip: "198.51.100.9", amount: "0.01" });
  assert.equal(result.kind, "reject");
  assert.equal(result.kind === "reject" && result.reason, "invalid_amount");
});

await check("the per-IP rate limit trips and sets Retry-After", async () => {
  resetRateLimits();
  const ip = "198.51.100.10";
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await preflight({ ...base, ip })).kind, "ok", `request ${i + 1} should pass`);
  }
  const limited = await preflight({ ...base, ip });
  assert.equal(limited.kind, "http");
  assert.equal(limited.kind === "http" && limited.status, 429);
  assert.equal(limited.kind === "http" && limited.reason, "rate_limited");
  assert.ok(limited.kind === "http" && (limited.retryAfter ?? 0) > 0);
});

await check("rate limits are per IP, not global", async () => {
  const result = await preflight({ ...base, ip: "198.51.100.11" });
  assert.equal(result.kind, "ok");
});

await check("mainnet settle is refused while the kill switch is off", async () => {
  resetRateLimits();
  const result = await preflight({
    ...base,
    net: "mainnet",
    phase: "settle",
    ip: "198.51.100.12",
    network: NETWORKS.mainnet.caip2,
    asset: USDC_MAINNET.address,
  });
  assert.equal(result.kind, "http");
  assert.equal(result.kind === "http" && result.status, 503);
  assert.equal(result.kind === "http" && result.reason, "mainnet_disabled");
});

// Verification spends nothing, so it must stay available even when settlement
// is switched off — otherwise an integration cannot be validated at all.
await check("mainnet verify still works while settle is disabled", async () => {
  const result = await preflight({
    ...base,
    net: "mainnet",
    phase: "verify",
    ip: "198.51.100.13",
    network: NETWORKS.mainnet.caip2,
    asset: USDC_MAINNET.address,
  });
  assert.equal(result.kind, "ok");
});

await check("client IP comes from the proxy headers", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "70.0.0.1, 10.0.0.1" })), "70.0.0.1");
  assert.equal(clientIp(new Headers({ "x-real-ip": "70.0.0.2" })), "70.0.0.2");
  assert.equal(clientIp(new Headers()), "unknown");
});

console.log(`\n${passed} checks passed.`);
