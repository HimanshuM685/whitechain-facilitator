/**
 * One x402Facilitator per network.
 *
 * Why not one instance for both: `FacilitatorEvmSigner` has no chain argument on
 * `readContract`/`writeContract`, so a signer is bound to exactly one chain.
 * Requests are therefore dispatched on `paymentPayload.accepted.network`.
 *
 * All verification and settlement logic lives in @x402/evm — EIP-712 recovery
 * (including EIP-1271 smart wallets), balance checks, simulation, nonce handling
 * and `settlement_pending` reconciliation. None of it is reimplemented here;
 * this file wires it to a signer and hangs logging off the lifecycle hooks.
 */

import { x402Facilitator } from "@x402/core/facilitator";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedKind,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/facilitator";
import { facilitatorSignerFor, publicClientFor } from "./chain";
import { logPayment } from "./db";
import { config } from "./guards";
import { findAsset, NETWORK_KEYS, NETWORKS, networkByCaip2, type NetworkKey } from "./networks";
import { safeErrorMessage } from "./redact";

/** Shared fields pulled out of a payload for the log, minus anything replayable. */
function describe(payload: PaymentPayload, requirements: PaymentRequirements, net: NetworkKey) {
  return {
    network: requirements.network,
    scheme: requirements.scheme,
    asset: requirements.asset,
    asset_symbol: findAsset(net, requirements.asset)?.symbol ?? null,
    pay_to: requirements.payTo,
    amount: requirements.amount,
    resource: payload.resource?.url ?? null,
  };
}

/** Whitechain's minimum base fee. Used only as a floor when estimating. */
const FLOOR_GAS_PRICE_WEI = 5_000_000_000n;

/**
 * Settlement gas actually spent, read from the receipt. SettleResponse does not
 * carry it, but the daily budget is a sum over this column, so it has to be
 * fetched.
 *
 * On failure it charges the budget a conservative over-estimate rather than
 * recording null. Null would mean a settlement that spent real WBT counted as
 * zero against the cap — so anyone able to make receipt reads fail would get
 * unmetered gas. Overcounting only refuses settles slightly early, which is the
 * safe direction for the guard on real spending.
 */
async function receiptCost(net: NetworkKey, txHash: string) {
  const client = publicClientFor(net);
  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    const gasUsed = receipt.gasUsed;
    const price = receipt.effectiveGasPrice ?? FLOOR_GAS_PRICE_WEI;
    return { gas_used: gasUsed.toString(), gas_cost_wei: (gasUsed * price).toString() };
  } catch {
    // The transaction may simply not be indexed yet; give it one short wait.
    try {
      const receipt = await client.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        timeout: 8_000,
      });
      const price = receipt.effectiveGasPrice ?? FLOOR_GAS_PRICE_WEI;
      return {
        gas_used: receipt.gasUsed.toString(),
        gas_cost_wei: (receipt.gasUsed * price).toString(),
      };
    } catch {
      console.warn(`[settle] receipt unreadable for ${txHash} on ${net}; charging budget the worst case`);
      return worstCaseCost();
    }
  }
}

/** Upper bound for one settlement, charged whenever the real cost is unknowable. */
const worstCaseCost = () => ({ gas_used: null, gas_cost_wei: (config.maxSettleGas * FLOOR_GAS_PRICE_WEI).toString() });

/** EIP-3009 authorization nonce of a payload, if it has one. */
const nonceOf = (payload: PaymentPayload): string | undefined =>
  (payload.payload as { authorization?: { nonce?: string } }).authorization?.nonce?.toLowerCase();

/**
 * Cost to record for a settle that came back without a transaction hash.
 *
 * Normally that means nothing was broadcast. But if `writeContract` threw — an
 * RPC timeout on `eth_sendRawTransaction` is the realistic case — the
 * transaction may have propagated anyway, and its hash is lost. Those are
 * charged the worst case so the budget never under-counts.
 */
function costWithoutHash(unconfirmed: Set<string>, payload: PaymentPayload) {
  const nonce = nonceOf(payload);
  return nonce !== undefined && unconfirmed.delete(nonce)
    ? worstCaseCost()
    : { gas_used: null, gas_cost_wei: null };
}

function build(net: NetworkKey): x402Facilitator {
  const facilitator = new x402Facilitator();

  // Authorization nonces whose broadcast threw: the tx may be on-chain with no
  // hash to show for it. Consumed by `costWithoutHash`.
  // ponytail: per-instance memory; an entry whose settle never reaches a hook
  // (it always does today) would linger until restart.
  const unconfirmed = new Set<string>();
  const signer = facilitatorSignerFor(net);

  registerExactEvmScheme(facilitator, {
    signer: {
      ...signer,
      writeContract: async (args) => {
        try {
          return await signer.writeContract(args);
        } catch (error) {
          // transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, ...)
          const nonce = args.args?.[5];
          if (typeof nonce === "string") unconfirmed.add(nonce.toLowerCase());
          throw error;
        }
      },
    },
    networks: NETWORKS[net].caip2,
    // Re-simulate inside settle so a payment that would revert on-chain is
    // never broadcast. Costs one extra eth_call; saves a wasted WBT fee.
    simulateInSettle: true,
  });

  const started = new WeakMap<object, number>();
  const elapsed = (key: object) => {
    const at = started.get(key);
    return at === undefined ? null : Date.now() - at;
  };

  return facilitator
    .onBeforeVerify(async (ctx) => {
      started.set(ctx.paymentPayload, Date.now());
    })
    .onAfterVerify(async ({ paymentPayload, requirements, result }) => {
      await logPayment(net, {
        kind: "verify",
        ok: result.isValid,
        error_reason: result.invalidReason ?? null,
        payer: result.payer ?? null,
        tx_hash: null,
        gas_used: null,
        gas_cost_wei: null,
        latency_ms: elapsed(paymentPayload),
        ...describe(paymentPayload, requirements, net),
      });
    })
    .onBeforeSettle(async (ctx) => {
      started.set(ctx.paymentPayload, Date.now());
    })
    .onAfterSettle(async ({ paymentPayload, requirements, result }) => {
      const cost = result.transaction
        ? await receiptCost(net, result.transaction)
        : costWithoutHash(unconfirmed, paymentPayload);
      await logPayment(net, {
        kind: "settle",
        ok: result.success,
        error_reason: result.errorReason ?? null,
        payer: result.payer ?? null,
        tx_hash: result.transaction || null,
        latency_ms: elapsed(paymentPayload),
        ...cost,
        ...describe(paymentPayload, requirements, net),
      });
    })
    .onSettleFailure(async ({ paymentPayload, requirements, error }) => {
      await logPayment(net, {
        kind: "settle",
        ok: false,
        // Redacted: this row is served publicly by /api/logs, and a raw viem
        // error carries the RPC URL and the decoded call arguments — including
        // the payer's signature.
        error_reason: safeErrorMessage(error),
        payer: null,
        tx_hash: null,
        latency_ms: elapsed(paymentPayload),
        ...costWithoutHash(unconfirmed, paymentPayload),
        ...describe(paymentPayload, requirements, net),
      });
    });
}

const instances = new Map<NetworkKey, x402Facilitator>();

export function facilitatorFor(net: NetworkKey): x402Facilitator {
  let instance = instances.get(net);
  if (!instance) {
    instance = build(net);
    instances.set(net, instance);
  }
  return instance;
}

/** Maps a CAIP-2 identifier off the wire to the network that serves it. */
export function networkKeyForCaip2(caip2: unknown): NetworkKey | undefined {
  return typeof caip2 === "string" ? networkByCaip2(caip2)?.key : undefined;
}

export type { PaymentPayload, PaymentRequirements, SettleResponse, VerifyResponse };

/**
 * The merged `/supported` body: both networks from one URL, since the network
 * travels inside the payload rather than in the endpoint.
 */
export function supported(): SupportedResponse {
  const kinds: SupportedKind[] = [];
  const signers: Record<string, string[]> = {};
  const extensions = new Set<string>();

  for (const net of NETWORK_KEYS) {
    const result = facilitatorFor(net).getSupported();
    // Each instance also advertises the v1 EVM networks it inherited from
    // `registerExactEvmScheme`; we only serve Whitechain, so filter to ours.
    // Re-stating `network` from the registry keeps it the CAIP-2 literal type
    // rather than the loose `string` the library declares.
    kinds.push(
      ...result.kinds
        .filter((kind) => kind.network === NETWORKS[net].caip2)
        .map((kind) => ({ ...kind, network: NETWORKS[net].caip2 })),
    );

    // @x402/core keys signers by CAIP family ("eip155:*"), while the spec
    // describes them as CAIP-2 keyed. Publish both so a client looking up either
    // the family or the concrete network finds the address that pays its gas.
    for (const [key, addresses] of Object.entries(result.signers)) {
      signers[key] = [...new Set([...(signers[key] ?? []), ...addresses])];
      const concrete = NETWORKS[net].caip2;
      signers[concrete] = [...new Set([...(signers[concrete] ?? []), ...addresses])];
    }

    for (const extension of result.extensions) extensions.add(extension);
  }

  return { kinds, extensions: [...extensions], signers };
}
