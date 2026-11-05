import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { NetCode, NetField, NetVal, OnlyOn } from "@/components/net";

/**
 * Components available to every MDX file without an import.
 *
 * The network-aware ones are what let the docs stay a single tree: prose is
 * written once and `{{token}}` placeholders in NetCode, plus NetVal/NetField,
 * resolve against whichever network the header toggle has selected.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
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
