"use client";

/**
 * Browser version of `pnpm smoke`: a wallet signs an EIP-3009 authorization
 * with the same @x402/evm client an agent uses, and the payload is posted
 * straight to this facilitator's /verify and /settle.
 *
 * The wallet only signs typed data — it never sends a transaction, so the
 * payer needs USDT and zero WBT.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  type EIP1193Provider,
} from "viem";
import { x402Client } from "@x402/core/client";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { chainFor, tokenAbi } from "@/lib/chain";
import { explorerTxUrl } from "@/lib/networks";
import { useNetwork } from "./network-provider";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

type Balances = { wbt: bigint; token: bigint };
type Step = { label: string; status: number | null; ms: number; body: unknown };

const field = "field";
const button = "btn btn-ghost";

export function TestPayment() {
  const { key, net } = useNetwork();
  const chain = chainFor(key);
  const publicClient = useMemo(() => createPublicClient({ chain, transport: http(net.rpc) }), [chain, net.rpc]);

  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [assetAddress, setAssetAddress] = useState(net.assets[0]?.address ?? "");
  const [amount, setAmount] = useState("0.01");
  const [payTo, setPayTo] = useState("");
  const [balances, setBalances] = useState<Balances | null>(null);
  const [before, setBefore] = useState<Balances | null>(null);
  const [payload, setPayload] = useState<{ payment: PaymentPayload; requirements: PaymentRequirements } | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const asset = net.assets.find((a) => a.address === assetAddress) ?? net.assets[0];

  // Switching network invalidates the asset choice and any signed payload.
  useEffect(() => {
    setAssetAddress(net.assets[0]?.address ?? "");
    setPayload(null);
    setSteps([]);
    setBefore(null);
  }, [net]);

  const refresh = useCallback(async () => {
    if (!account || !asset) return null;
    const [wbt, token] = await Promise.all([
      publicClient.getBalance({ address: account }),
      publicClient.readContract({ address: asset.address, abi: tokenAbi, functionName: "balanceOf", args: [account] }) as Promise<bigint>,
    ]);
    const next = { wbt, token };
    setBalances(next);
    return next;
  }, [account, asset, publicClient]);

  useEffect(() => {
    refresh().catch(() => setBalances(null));
  }, [refresh]);

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError((e as { shortMessage?: string }).shortMessage ?? (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const connect = () =>
    run("connect", async () => {
      if (!window.ethereum) throw new Error("No browser wallet found. Install MetaMask or similar.");
      const [address] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
      if (!address) throw new Error("Wallet returned no account.");
      setAccount(address);
      setPayTo((current) => current || address);
    });

  const sign = () =>
    run("sign", async () => {
      if (!window.ethereum || !account || !asset) return;
      if (!isAddress(payTo)) throw new Error("payTo is not a valid address.");

      const wallet = createWalletClient({ account, chain, transport: custom(window.ethereum) });
      // The chain id is part of the EIP-712 domain; most wallets refuse to sign
      // typed data for a chain other than the active one.
      try {
        await wallet.switchChain({ id: chain.id });
      } catch {
        await wallet.addChain({ chain });
      }

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: net.caip2,
        asset: asset.address,
        amount: parseUnits(amount, asset.decimals).toString(),
        payTo,
        maxTimeoutSeconds: 120,
        extra: asset.domain,
      };
      const paymentRequired: PaymentRequired = {
        x402Version: 2,
        resource: { url: `${window.location.origin}/test`, description: "Facilitator test page", mimeType: "application/json" },
        accepts: [requirements],
      };

      const signer = {
        address: account,
        signTypedData: (message: Parameters<typeof wallet.signTypedData>[0]) => wallet.signTypedData(message),
      };
      // Whitechain USDT is not in the client's default asset list, so opt it in
      // explicitly — the same config the agent docs show.
      const payment = await x402Client
        .fromConfig({
          schemes: [{ network: net.caip2, client: new ExactEvmScheme(signer as never) }],
          spendControls: {
            allowedAssets: [{ network: net.caip2, asset: asset.address, maxAmountPerPayment: requirements.amount }],
          },
        })
        .createPaymentPayload(paymentRequired);

      setPayload({ payment, requirements });
      setSteps([]);
      setBefore(await refresh());
    });

  const post = (path: "/verify" | "/settle") =>
    run(path, async () => {
      if (!payload) return;
      const started = performance.now();
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentPayload: payload.payment, paymentRequirements: payload.requirements }),
      });
      const body = await response.json().catch(() => null);
      setSteps((s) => [...s, { label: path, status: response.status, ms: Math.round(performance.now() - started), body }]);
      if (path === "/settle") await refresh();
    });

  const tx = [...steps].reverse().find((s) => s.label === "/settle")?.body as { transaction?: string } | undefined;

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section className="glass space-y-4 p-6">
        <h2 className="eyebrow">1 · Wallet</h2>
        {account ? (
          <div className="space-y-1 font-mono text-xs">
            <div className="break-all">{account}</div>
            {balances && asset && (
              <div className="text-chalk-dim">
                {formatUnits(balances.token, asset.decimals)} {asset.symbol} · {formatEther(balances.wbt)} WBT
              </div>
            )}
          </div>
        ) : (
          <button className="btn btn-solid" onClick={connect} disabled={busy !== null}>
            Connect wallet
          </button>
        )}

        <h2 className="pt-2 eyebrow">2 · Payment</h2>
        <label className="block space-y-1 text-xs text-chalk-dim">
          Asset
          <select className={field} value={assetAddress} onChange={(e) => setAssetAddress(e.target.value as `0x${string}`)}>
            {net.assets.map((a) => (
              <option key={a.address} value={a.address}>
                {a.symbol} · {a.address}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-xs text-chalk-dim">
          Amount ({asset?.symbol})
          <input className={field} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </label>
        <label className="block space-y-1 text-xs text-chalk-dim">
          Pay to (defaults to your own address)
          <input className={field} value={payTo} onChange={(e) => setPayTo(e.target.value.trim())} placeholder="0x…" />
        </label>

        <div className="flex flex-wrap gap-2 pt-2">
          <button className={button} onClick={sign} disabled={!account || !asset || busy !== null}>
            {busy === "sign" ? "Signing…" : "Sign authorization"}
          </button>
          <button className={button} onClick={() => post("/verify")} disabled={!payload || busy !== null}>
            {busy === "/verify" ? "Verifying…" : "Verify"}
          </button>
          <button className="btn btn-solid" onClick={() => post("/settle")} disabled={!payload || busy !== null}>
            {busy === "/settle" ? "Settling…" : "Settle"}
          </button>
        </div>

        {!asset && (
          <p className="text-xs text-danger">
            No gasless USDT on {net.name}: its USDT contract has no EIP-3009. Switch to testnet.
          </p>
        )}
        {balances && balances.wbt > 0n && (
          <p className="text-xs text-testnet">
            This wallet holds WBT. That works, but a zero-WBT wallet proves gas was sponsored.
          </p>
        )}
        {error && <p className="text-xs break-words text-danger">{error}</p>}
      </section>

      <section className="glass space-y-4 p-6">
        <h2 className="eyebrow">3 · Results</h2>
        {!payload && <p className="text-xs text-chalk-dim">Sign an authorization to begin. Signing costs nothing.</p>}

        {payload && (
          <details className="text-xs">
            <summary className="cursor-pointer text-chalk-dim">Signed payload</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-ink-line bg-black/60 p-3 font-mono text-[11px]">
              {JSON.stringify(payload.payment, null, 2)}
            </pre>
          </details>
        )}

        {steps.map((step, i) => (
          <div key={i} className="text-xs">
            <div className="font-mono">
              <span className="text-white">{step.label}</span>{" "}
              <span className={step.status === 200 ? "text-mainnet" : "text-danger"}>{step.status}</span>{" "}
              <span className="text-chalk-dim">{step.ms}ms</span>
            </div>
            <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-ink-line bg-black/60 p-3 font-mono text-[11px]">
              {JSON.stringify(step.body, null, 2)}
            </pre>
          </div>
        ))}

        {tx?.transaction && (
          <a
            className="block font-mono text-xs break-all text-mainnet hover:underline"
            href={explorerTxUrl(key, tx.transaction)}
            target="_blank"
            rel="noreferrer"
          >
            {tx.transaction} ↗
          </a>
        )}

        {tx?.transaction && before && balances && asset && (
          <div className="font-mono text-xs text-chalk-dim">
            <div>
              {asset.symbol}: {formatUnits(balances.token - before.token, asset.decimals)}
            </div>
            <div className={balances.wbt === before.wbt ? "text-mainnet" : "text-danger"}>
              WBT: {formatEther(balances.wbt - before.wbt)} {balances.wbt === before.wbt && "(gas sponsored)"}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
