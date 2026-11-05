import { Suspense } from "react";
import type { Metadata } from "next";
import { NetworkProvider } from "@/components/network-provider";
import { MainnetBanner } from "@/components/network-switch";
import { SiteHeader } from "@/components/site-header";
import { isNetworkKey } from "@/lib/networks";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "x402 facilitator for Whitechain",
    template: "%s · x402 facilitator for Whitechain",
  },
  description:
    "Gasless x402 payments on Whitechain. Payers sign an EIP-3009 authorization; we submit it and pay the WBT. Mainnet and Sepolia, with a public log of every settlement.",
};

const DEFAULT_NETWORK = isNetworkKey(process.env.NEXT_PUBLIC_DEFAULT_NETWORK)
  ? process.env.NEXT_PUBLIC_DEFAULT_NETWORK
  : "testnet";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        {/* NetworkProvider reads useSearchParams, so it needs a Suspense boundary. */}
        <Suspense fallback={null}>
          <NetworkProvider defaultNetwork={DEFAULT_NETWORK}>
            <MainnetBanner />
            <SiteHeader />
            {children}
            <footer className="mt-24 border-t border-ink-line px-4 py-8">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 text-xs text-chalk-dim">
                <span>Non-custodial. Funds move payer to merchant; we only pay the gas.</span>
                <a className="ml-auto hover:text-chalk" href="https://docs.whitechain.io">
                  Whitechain docs
                </a>
                <a className="hover:text-chalk" href="https://docs.x402.org">
                  x402 spec
                </a>
                <a className="hover:text-chalk" href="/health">
                  Status
                </a>
              </div>
            </footer>
          </NetworkProvider>
        </Suspense>
      </body>
    </html>
  );
}
