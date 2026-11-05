import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DOC_ENTRIES, docHref, docNeighbours, findDoc } from "@/lib/docs-nav";

type Params = { slug?: string[] };

/**
 * The doc list is closed, so anything outside generateStaticParams is a real 404
 * rather than a page to render on demand. Without this, Next serves the
 * not-found shell with a 200 for any unknown slug.
 */
export const dynamicParams = false;

/** Only the pages listed in DOCS exist; a stray .mdx file is not routable. */
export function generateStaticParams(): Params[] {
  return DOC_ENTRIES.map((entry) => (entry.slug === "index" ? { slug: [] } : { slug: [entry.slug] }));
}

const slugFrom = (params: Params) => params.slug?.join("/") ?? "index";

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const entry = findDoc(slugFrom(await params));
  if (!entry) return {};
  return { title: entry.title, description: entry.summary };
}

export default async function DocPage({ params }: { params: Promise<Params> }) {
  const slug = slugFrom(await params);
  const entry = findDoc(slug);
  if (!entry) notFound();

  // Dynamic import over a fixed directory: webpack bundles every .mdx under
  // content/docs and resolves this at request time, which keeps the page list in
  // lib/docs-nav.ts rather than duplicated as one route file per page.
  const { default: Body } = await import(`@/content/docs/${slug}.mdx`);
  const { prev, next } = docNeighbours(slug);

  return (
    <article>
      <header className="mb-8 border-b border-ink-line pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">{entry.title}</h1>
        <p className="mt-2 text-chalk-dim">{entry.summary}</p>
      </header>

      <div className="prose-docs max-w-none">
        <Body />
      </div>

      {(prev || next) && (
        <nav className="mt-16 flex gap-3 border-t border-ink-line pt-6 text-sm">
          {prev && (
            <Link
              href={docHref(prev.slug)}
              className="rounded-lg border border-ink-line bg-ink-raised px-4 py-3 text-chalk-dim transition-colors hover:text-chalk"
            >
              ← {prev.title}
            </Link>
          )}
          {next && (
            <Link
              href={docHref(next.slug)}
              className="ml-auto rounded-lg border border-ink-line bg-ink-raised px-4 py-3 text-right text-chalk-dim transition-colors hover:text-chalk"
            >
              {next.title} →
            </Link>
          )}
        </nav>
      )}
    </article>
  );
}
