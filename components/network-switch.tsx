"use client";

import { NETWORK_KEYS, NETWORKS } from "@/lib/networks";
import { useNetwork } from "./network-provider";

/** Segmented mainnet/testnet control. Mainnet is tinted differently on purpose. */
export function NetworkSwitch() {
  const { key, setNetwork } = useNetwork();

  return (
    <div
      role="radiogroup"
      aria-label="Network"
      className="flex items-center gap-0.5 rounded-lg border border-ink-line bg-ink-raised p-0.5"
    >
      {NETWORK_KEYS.map((candidate) => {
        const active = candidate === key;
        const tint = candidate === "mainnet" ? "text-mainnet" : "text-testnet";
        return (
          <button
            key={candidate}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setNetwork(candidate)}
            className={[
              "rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
              active ? `bg-ink ${tint}` : "text-chalk-dim hover:text-chalk",
            ].join(" ")}
          >
            {candidate}
            <span className="ml-1.5 opacity-50">{NETWORKS[candidate].chainId}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Standing reminder that the selected network moves real funds. Shown rather than
 * relying on the reader noticing a toggle label — a mainnet code sample copied by
 * accident is the most expensive mistake this site can cause.
 */
export function MainnetBanner() {
  const { isMainnet } = useNetwork();
  if (!isMainnet) return null;

  return (
    <div className="border-b border-mainnet/25 bg-mainnet/10 px-4 py-2 text-center text-xs text-mainnet">
      Mainnet selected — addresses and snippets below move real USDC.e on Whitechain (chain 1875).
    </div>
  );
}
