import type { Metadata } from "next";
import { LiveStats } from "@/components/live-stats";
import { PageHero } from "@/components/page-hero";
import { PaymentLog } from "@/components/payment-log";

export const metadata: Metadata = {
  title: "Transactions",
  description:
    "Every x402 payment this facilitator has settled on Whitechain, with explorer links and the WBT gas sponsored for each.",
};

export default function LogsPage() {
  return (
    <main className="relative z-[1] mx-auto max-w-6xl px-5 py-12">
      <PageHero
        badge="Public settlement log"
        title={
          <>
            Every payment, <em className="serif-em">on the record.</em>
          </>
        }
        lede="Each settlement carries an on-chain hash you can check yourself: the USDT goes straight from payer to merchant, and our signer pays the WBT fee."
      />
      <section className="appear appear--soft [--d:0.42s]">
        <LiveStats />
      </section>
      <section className="mt-12 appear appear--soft [--d:0.52s]">
        <PaymentLog />
      </section>
    </main>
  );
}
