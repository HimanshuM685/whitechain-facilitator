import type { Metadata } from "next";
import { PaymentLog } from "@/components/payment-log";

export const metadata: Metadata = {
  title: "Transaction log",
  description:
    "Every x402 payment this facilitator has verified or settled on Whitechain, with explorer links and the WBT gas sponsored for each.",
};

export default function LogsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Transaction log</h1>
      <p className="mt-3 max-w-2xl text-chalk-dim">
        Every payment this facilitator has handled, per network. Settlements carry an on-chain hash you can
        check yourself: the token transfer goes payer to merchant, while the transaction fee is paid by our
        signer. Verification attempts are included too — they cost no gas but show what was refused and why.
      </p>
      <PaymentLog />
    </main>
  );
}
