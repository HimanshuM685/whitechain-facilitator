/**
 * End-to-end proof: an account holding the stablecoin and ZERO WBT pays a real
 * x402 endpoint, and still holds zero WBT afterwards.
 *
 * That last assertion is the point of the whole project. If the payer's native
 * balance moved, gas was not sponsored and something is wrong.
 *
 *   pnpm smoke                      # against localhost, testnet
 *   pnpm smoke -- --network=mainnet --url=https://your-facilitator.example
 *
 * Needs SMOKE_PAYER_PRIVATE_KEY set to a funded-with-stablecoin, zero-WBT account.
 */

import assert from "node:assert/strict";
import { formatEther, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { publicClientFor, tokenAbi } from "../lib/chain";
import { isNetworkKey, NETWORKS, type NetworkKey } from "../lib/networks";

const arg = (name: string, fallback: string): string =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;

const network = arg("network", "testnet");
assert.ok(isNetworkKey(network), `--network must be one of: ${Object.keys(NETWORKS).join(", ")}`);
const net: NetworkKey = network;

const baseUrl = arg("url", process.env.NEXT_PUBLIC_FACILITATOR_URL ?? "http://localhost:3000").replace(/\/$/, "");
const endpoint = arg("endpoint", `${baseUrl}/api/demo/joke`);

const key = process.env.SMOKE_PAYER_PRIVATE_KEY;
assert.ok(key, "SMOKE_PAYER_PRIVATE_KEY is not set (see .env.example)");

const account = privateKeyToAccount(key as `0x${string}`);
const client = publicClientFor(net);
const asset = NETWORKS[net].assets[0]!;

console.log(`network   ${NETWORKS[net].name} (${NETWORKS[net].caip2})`);
console.log(`payer     ${account.address}`);
console.log(`endpoint  ${endpoint}\n`);

/* 1. The facilitator should advertise this network before we try to use it. */

const supported = (await (await fetch(`${baseUrl}/supported`)).json()) as {
  kinds: { scheme: string; network: string }[];
};
assert.ok(
  supported.kinds.some((k) => k.network === NETWORKS[net].caip2 && k.scheme === "exact"),
  `/supported does not advertise exact on ${NETWORKS[net].caip2}`,
);
console.log("ok  /supported advertises this network");

/* 2. Starting balances. The native balance being zero is the premise. */

const readBalance = (address: `0x${string}`) =>
  client.readContract({ address: asset.address, abi: tokenAbi, functionName: "balanceOf", args: [address] }) as Promise<bigint>;

const [wbtBefore, tokenBefore] = await Promise.all([
  client.getBalance({ address: account.address }),
  readBalance(account.address),
]);

console.log(`    WBT      ${formatEther(wbtBefore)}`);
console.log(`    ${asset.symbol.padEnd(8)} ${formatUnits(tokenBefore, asset.decimals)}`);

assert.equal(wbtBefore, 0n, `payer holds ${formatEther(wbtBefore)} WBT — it must be exactly 0 for this to prove anything`);
assert.ok(tokenBefore > 0n, `payer holds no ${asset.symbol}; fund it first`);

/* 3. Unpaid request must be a 402 carrying usable terms. */

const unpaid = await fetch(endpoint);
assert.equal(unpaid.status, 402, `expected 402, got ${unpaid.status}`);

const header = unpaid.headers.get("payment-required");
assert.ok(header, "402 response carried no PAYMENT-REQUIRED header");

const terms = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as {
  accepts: { network: string; asset: string; amount: string; extra?: Record<string, unknown> }[];
};
const option = terms.accepts.find((a) => a.network === NETWORKS[net].caip2);
assert.ok(option, `402 terms offer no option for ${NETWORKS[net].caip2}`);

// A missing or wrong `extra` is the failure mode that produces a payment which
// never works and leaves nothing on-chain to debug, so check it explicitly.
assert.deepEqual(
  option.extra,
  { name: asset.domain.name, version: asset.domain.version },
  "402 terms advertise the wrong EIP-712 domain",
);
console.log(`ok  402 terms: ${formatUnits(BigInt(option.amount), asset.decimals)} ${asset.symbol}, domain verified`);

/* 4. Pay it. */

const fetchWithPay = wrapFetchWithPayment(
  fetch,
  new x402Client().register(NETWORKS[net].caip2, new ExactEvmScheme(account)),
);

const started = Date.now();
const paid = await fetchWithPay(endpoint);
const elapsed = Date.now() - started;

assert.equal(paid.status, 200, `payment failed: ${paid.status} ${await paid.text()}`);

const settlement = paid.headers.get("x-payment-response");
assert.ok(settlement, "paid response carried no X-PAYMENT-RESPONSE header");

const receipt = JSON.parse(Buffer.from(settlement, "base64").toString("utf8")) as {
  success: boolean;
  transaction: string;
};
assert.equal(receipt.success, true, "settlement reported failure");
assert.match(receipt.transaction, /^0x[0-9a-fA-F]{64}$/, "settlement returned no transaction hash");

console.log(`ok  paid in ${elapsed}ms`);
console.log(`    ${NETWORKS[net].explorer}/tx/${receipt.transaction}`);

/* 5. The assertion the whole thing exists for. */

const [wbtAfter, tokenAfter] = await Promise.all([
  client.getBalance({ address: account.address }),
  readBalance(account.address),
]);

assert.equal(wbtAfter, 0n, `payer's WBT went from 0 to ${formatEther(wbtAfter)} — gas was NOT sponsored`);
assert.ok(tokenAfter < tokenBefore, `${asset.symbol} balance did not decrease; nothing was actually paid`);

console.log(`ok  payer still holds 0 WBT; ${asset.symbol} fell by ${formatUnits(tokenBefore - tokenAfter, asset.decimals)}`);

/* 6. And it should be in the public log. */

const logs = (await (await fetch(`${baseUrl}/api/logs?network=${net}&limit=25&settlesOnly=1`)).json()) as {
  rows: { tx_hash: string | null; ok: boolean; gas_cost_wei: string | null }[];
};
const logged = logs.rows.find((row) => row.tx_hash?.toLowerCase() === receipt.transaction.toLowerCase());
assert.ok(logged, "settlement is missing from /api/logs");
assert.equal(logged.ok, true);
console.log(`ok  logged, gas sponsored ${formatEther(BigInt(logged.gas_cost_wei ?? "0"))} WBT`);

console.log("\nAll smoke checks passed.");
