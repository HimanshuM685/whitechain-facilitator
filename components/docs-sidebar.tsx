"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS, docHref } from "@/lib/docs-nav";

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <nav className="sticky top-20 space-y-6">
        {DOCS.map((section) => (
          <div key={section.heading}>
            <p className="mb-2 font-mono text-[11px] tracking-widest text-chalk-dim uppercase">
              {section.heading}
            </p>
            <ul className="space-y-0.5">
              {section.entries.map((entry) => {
                const href = docHref(entry.slug);
                const active = pathname === href;
                return (
                  <li key={entry.slug}>
                    <Link
                      href={href}
                      className={[
                        "block rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-ink-raised font-medium text-accent"
                          : "text-chalk-dim hover:bg-ink-raised hover:text-chalk",
                      ].join(" ")}
                    >
                      {entry.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
