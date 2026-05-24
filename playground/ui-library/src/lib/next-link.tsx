// Minimal stub for Next.js' `Link` component — just a plain anchor.
import type { ComponentProps } from "react"
export default function Link({ href, children, ...rest }: ComponentProps<"a">) {
  return <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
}
