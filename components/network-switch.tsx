"use client";

import { NETWORK_KEYS } from "@/lib/networks";
import { useNetwork } from "./network-provider";

/** Segmented mainnet/testnet control in the liquid-metal style. The dot colour marks the network. */
export function NetworkSwitch() {
  const { key, setNetwork } = useNetwork();

  return (
    <div
      role="radiogroup"
      aria-label="Network"
      className="flex h-[var(--btn-h)] items-center gap-0.5 rounded-md border border-[rgba(198,198,198,0.45)] bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(0,0,0,0.5)_50%,rgba(160,175,200,0.06))] p-[3px]"
    >
      {NETWORK_KEYS.map((candidate) => {
        const active = candidate === key;
        const dot = candidate === "mainnet" ? "bg-mainnet" : "bg-testnet";
        return (
          <button
            key={candidate}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setNetwork(candidate)}
            className={[
              "flex h-full cursor-pointer items-center gap-1.5 rounded px-2.5 text-[12px] tracking-[-0.01em] transition-[background,color,box-shadow] duration-300",
              active
                ? "bg-[linear-gradient(105deg,#111_0%,#3a3a3a_45%,#6a6a6a_100%)] text-white shadow-[0_0_14px_rgba(200,210,230,0.16)]"
                : "text-chalk-dim hover:text-white",
            ].join(" ")}
          >
            <span className={`size-1.5 rounded-full ${dot} ${active ? "" : "opacity-50"}`} />
            {candidate === "mainnet" ? "Mainnet" : "Sepolia"}
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
    <div className="relative z-[60] border-b border-white/10 bg-[linear-gradient(90deg,#2a2a2a,#0a0a0a)] px-4 py-2 text-center text-xs text-[#f2f2f2]">
      Mainnet selected — USDT is not gasless on Whitechain mainnet (no EIP-3009), so nothing settles here.
    </div>
  );
}
