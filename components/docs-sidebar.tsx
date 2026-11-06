"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS, docHref } from "@/lib/docs-nav";

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <nav className="sticky top-8 space-y-6">
        {DOCS.map((section) => (
          <div key={section.heading}>
            <p className="eyebrow mb-2">
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
                        "block rounded-md border px-2.5 py-1.5 text-sm tracking-[-0.01em] transition-[background,border-color,color,box-shadow] duration-300",
                        active
                          ? "border-[rgba(235,235,235,0.6)] bg-[linear-gradient(105deg,#111_0%,#2a2a2a_55%,#4a4a4a_100%)] text-white shadow-[0_0_14px_rgba(200,210,230,0.12)]"
                          : "border-transparent text-chalk-dim hover:border-white/10 hover:bg-white/[0.04] hover:text-white",
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
