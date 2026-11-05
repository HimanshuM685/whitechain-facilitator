import Link from "next/link";
import { NetworkSwitch } from "./network-switch";

const LINKS = [
  { href: "/docs", label: "Docs" },
  { href: "/logs", label: "Transactions" },
  { href: "/supported", label: "API" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-line bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5 font-mono text-sm">
          <span className="inline-block size-2 rounded-full bg-accent shadow-[0_0_12px] shadow-accent/60" />
          <span className="font-semibold tracking-tight">x402 · whitechain</span>
        </Link>

        <nav className="ml-auto flex items-center gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2.5 py-1.5 text-sm text-chalk-dim transition-colors hover:bg-ink-raised hover:text-chalk"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <NetworkSwitch />
      </div>
    </header>
  );
}
