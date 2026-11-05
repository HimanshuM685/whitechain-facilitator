import type { Metadata } from "next";
import { TestPayment } from "@/components/test-payment";

export const metadata: Metadata = {
  title: "Test a payment",
  description: "Sign an x402 payment in your browser wallet and run it through this facilitator's /verify and /settle.",
};

export default function TestPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Test a payment</h1>
      <p className="mt-3 max-w-2xl text-chalk-dim">
        Your wallet signs an EIP-3009 authorization. It does not send a transaction. The signed payload goes to{" "}
        <code className="font-mono text-chalk">/verify</code> and <code className="font-mono text-chalk">/settle</code>{" "}
        on this facilitator, which submits it and pays the WBT gas. Paying yourself is the easiest test: your token
        balance stays the same and your WBT doesn&apos;t move.
      </p>
      <TestPayment />
    </main>
  );
}
