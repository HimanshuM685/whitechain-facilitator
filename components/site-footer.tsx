"use client";

import { usePathname } from "next/navigation";
import { Logo } from "./logo";

/** Shared footer. The home page is a single viewport with its own stats row, so it has none. */
export function SiteFooter() {
  if (usePathname() === "/") return null;

  return (
    <footer className="relative z-[1] mt-24 border-t border-ink-line px-[var(--header-x)] py-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-chalk-dim">
        <Logo className="!text-[14px]" />
        <span>Non-custodial. USDT moves payer to merchant; we only pay the WBT gas.</span>
        <a className="ml-auto transition-colors hover:text-white" href="https://docs.whitechain.io">
          Whitechain docs
        </a>
        <a className="transition-colors hover:text-white" href="https://docs.x402.org">
          x402 spec
        </a>
        <a className="transition-colors hover:text-white" href="/health">
          Status
        </a>
      </div>
    </footer>
  );
}
