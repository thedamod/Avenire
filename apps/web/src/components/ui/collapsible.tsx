"use client"

import { Collapsible as CollapsiblePrimitive } from "radix-ui"

/**
 * Renders a Radix Collapsible Root wrapper that forwards all received props and sets `data-slot="collapsible"`.
 *
 * @param props - Props forwarded to `CollapsiblePrimitive.Root`
 * @returns A React element rendering the Radix Collapsible Root with the provided props and `data-slot="collapsible"`
 */
function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

/**
 * Render a collapsible trigger that forwards all props to the underlying Radix CollapsibleTrigger and sets `data-slot="collapsible-trigger"`.
 *
 * @param props - Props applied to the underlying CollapsibleTrigger element.
 * @returns The rendered CollapsibleTrigger element with the `data-slot="collapsible-trigger"` attribute set.
 */
function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

/**
 * Renders a collapsible content element that forwards all received props and sets `data-slot="collapsible-content"`.
 *
 * @param props - Props forwarded to the Radix CollapsibleContent primitive.
 * @returns The rendered CollapsibleContent element.
 */
function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
