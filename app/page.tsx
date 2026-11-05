import Link from "next/link";
import { LiveStats } from "@/components/live-stats";
import { NetCode, NetField, NetVal } from "@/components/net";

const STEPS = [
  {
    who: "Merchant",
    what: "Returns 402",
    detail:
      "Your endpoint answers an unpaid request with 402 Payment Required and the terms: asset, amount, payTo, network.",
  },
  {
    who: "Payer",
    what: "Signs, offline",
    detail:
      "The agent or wallet signs an EIP-3009 TransferWithAuthorization. No transaction, no gas, no WBT — just a signature.",
  },
  {
    who: "Facilitator",
    what: "Pays the gas",
    detail:
      "We verify the signature and simulate the transfer, then submit transferWithAuthorization and pay the WBT fee ourselves.",
  },
  {
    who: "Chain",
    what: "Payer → merchant",
    detail:
      "The token moves directly between the two parties. We never hold it, and the signature authorises exactly one transfer.",
  },
];

export default function HomePage() {
  return (
    <main>
      <section className="bg-grid border-b border-ink-line">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="font-mono text-xs tracking-widest text-accent uppercase">
            x402 v2 facilitator · exact · eip-3009
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
            Get paid per request on Whitechain. Your payer never touches WBT.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-chalk-dim">
            A gas-sponsoring facilitator for the x402 payment protocol, live on Whitechain mainnet and
            Sepolia. Point any <code className="font-mono text-base text-chalk">@x402/*</code> middleware at
            this URL and an agent holding only stablecoins can pay your API. Every settlement is logged in
            public.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/docs/quickstart-merchant"
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-ink transition-opacity hover:opacity-90"
            >
              Charge for an endpoint
            </Link>
            <Link
              href="/docs/quickstart-agent"
              className="rounded-lg border border-ink-line bg-ink-raised px-4 py-2.5 text-sm text-chalk transition-colors hover:border-chalk-dim"
            >
              Pay for one
            </Link>
            <Link href="/logs" className="px-2 py-2.5 text-sm text-chalk-dim hover:text-chalk">
              See the transaction log →
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <LiveStats />
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Point your middleware here</h2>
          <p className="mt-2 text-sm text-chalk-dim">
            One URL serves both networks — x402 carries the network inside the payment payload, so there is
            no separate mainnet endpoint to remember.
          </p>
          <NetCode filename="server.ts">{`
import { paymentMiddleware } from "@x402/express";

app.use(
  paymentMiddleware(
    {
      "/api/report": {
        accepts: {
          scheme: "exact",
          network: "{{caip2}}",
          payTo: "0xYourMerchantAddress",
          price: {
            asset: "{{asset}}",          // {{assetSymbol}} on {{networkName}}
            amount: "10000",             // 0.01, six decimals
            extra: { name: "{{assetDomainName}}", version: "{{assetDomainVersion}}" },
          },
        },
        description: "One generated report",
      },
    },
    { url: "{{facilitatorUrl}}" },
  ),
);
`}</NetCode>
          <p className="text-sm text-chalk-dim">
            <strong className="font-medium text-chalk">Why the explicit price?</strong> Whitechain is not in
            the x402 SDK&apos;s default asset table, so the <code className="font-mono">price: &quot;$0.01&quot;</code>{" "}
            shorthand has no token to resolve to. The <code className="font-mono">extra</code> field is the
            token&apos;s real EIP-712 domain — get it wrong and every signature fails silently, which is why{" "}
            <Link href="/docs/supported-assets">we publish verified values</Link> and serve them from{" "}
            <Link href="/assets">/assets</Link>.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            <NetVal k="networkName" mono={false} />
          </h2>
          <p className="mt-2 text-sm text-chalk-dim">
            Switch networks in the header; every address and snippet on this site follows.
          </p>
          <div className="mt-4 rounded-xl border border-ink-line bg-ink-raised px-4 py-2">
            <NetField label="Chain ID" k="chainId" />
            <NetField label="CAIP-2" k="caip2" />
            <NetField label="RPC" k="rpc" />
            <NetField label="Explorer" k="explorer" />
            <NetField label="USDC.e" k="usdc" />
            <NetField label="USDT" k="usdt" />
            <NetField label="Faucet" k="faucet" />
          </div>
        </div>
      </section>

      <section className="border-t border-ink-line">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-xl font-semibold tracking-tight">Where the gas goes</h2>
          <p className="mt-2 max-w-2xl text-sm text-chalk-dim">
            There is no transaction batching involved — that is an Algorand idea. On an EVM chain the payer
            delegates a single transfer by signature, and someone else submits it.
          </p>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-xl border border-ink-line bg-ink-line md:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.who} className="bg-ink-raised px-4 py-5">
                <span className="font-mono text-xs text-accent">
                  {String(index + 1).padStart(2, "0")} · {step.who}
                </span>
                <h3 className="mt-2 font-medium">{step.what}</h3>
                <p className="mt-1.5 text-sm text-chalk-dim">{step.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
