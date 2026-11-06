import Link from "next/link";
import { HomeStats } from "@/components/home-stats";

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260818_072341_50851634-bbc3-4c33-9acc-7647d4db44aa.mp4";

export default function HomePage() {
  return (
    <>
      <div className="hero-photo" aria-hidden="true">
        <video autoPlay muted loop playsInline preload="auto" src={HERO_VIDEO} />
      </div>

      <div className="home">
        <main className="hero" id="top">
          <div className="hero-copy">
            <span className="badge appear appear--pop [--d:0.22s]">
              <svg className="badge-star" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                <path d="M12 2.6C12.55 2.6 12.88 3.15 13.08 4.7c.62 4.7 1.52 5.6 6.22 6.22 1.55.2 2.1.53 2.1 1.08s-.55.88-2.1 1.08c-4.7.62-5.6 1.52-6.22 6.22-.2 1.55-.53 2.1-1.08 2.1s-.88-.55-1.08-2.1c-.62-4.7-1.52-5.6-6.22-6.22C3.15 12.88 2.6 12.55 2.6 12s.55-.88 2.1-1.08c4.7-.62 5.6-1.52 6.22-6.22C11.12 3.15 11.45 2.6 12 2.6Z" />
              </svg>
              x402 Facilitator for Whitechain
            </span>

            <h1>
              <span className="headline-line">
                <span className="appear appear--mask [--d:0.42s]">
                  Accept <em>gasless USDT</em> on your
                </span>
              </span>
              <span className="headline-line">
                <span className="appear appear--mask [--d:0.62s]">APIs in minutes.</span>
              </span>
            </h1>

            <p className="lede appear appear--soft [--d:0.82s]">
              Your customers sign once and hold zero WBT. We settle the payment on-chain, pay the gas, and the USDT
              goes straight to you. Standard x402 middleware, one URL.
            </p>

            <div className="hero-actions">
              <Link href="/docs/quickstart-merchant" className="btn btn-solid btn-hero appear appear--btn [--d:0.96s]">
                Start building
              </Link>
              <Link href="/test" className="btn btn-ghost btn-hero appear appear--side [--d:1.10s]">
                Try a payment
              </Link>
            </div>
          </div>
        </main>

        <HomeStats />
      </div>
    </>
  );
}
