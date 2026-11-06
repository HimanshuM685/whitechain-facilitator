import type { MDXComponents } from "mdx/types";
import { Children, isValidElement, type ReactNode } from "react";
import Link from "next/link";
import { NetCode, NetField, NetVal, OnlyOn } from "@/components/net";

/**
 * Components available to every MDX file without an import.
 *
 * The network-aware ones are what let the docs stay a single tree: prose is
 * written once and `{{token}}` placeholders in NetCode, plus NetVal/NetField,
 * resolve against whichever network the header toggle has selected.
 */
/** Plain text of a heading's children, for its anchor id. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return Children.toArray(node).map(textOf).join("");
}

/** "3. Discover a merchant's endpoints" → "3-discover-a-merchants-endpoints". */
const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // Linkable headings, so docs can point at a section (/docs/bazaar#3-discover-…).
    h2: ({ children, ...rest }) => (
      <h2 id={slugify(textOf(children))} {...rest}>
        {children}
      </h2>
    ),
    h3: ({ children, ...rest }) => (
      <h3 id={slugify(textOf(children))} {...rest}>
        {children}
      </h3>
    ),
    NetCode,
    NetField,
    NetVal,
    OnlyOn,
    // Internal links go through next/link so docs navigation stays client-side
    // and the ?network= selection survives the hop.
    a: ({ href, children, ...rest }) => {
      const target = String(href ?? "");
      return target.startsWith("/") ? (
        <Link href={target} {...rest}>
          {children}
        </Link>
      ) : (
        <a href={target} target="_blank" rel="noreferrer" {...rest}>
          {children}
        </a>
      );
    },
    ...components,
  };
}
