"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

import { cn } from "../lib/utils"

type ExpandableTabItem = {
  value: string
  label: string
  icon: LucideIcon
  disabled?: boolean
}

type ExpandableTabsProps = {
  items: ExpandableTabItem[]
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null) => void
  allowDeselect?: boolean
  className?: string
}

/**
 * Finds the next non-disabled tab index in the given direction, wrapping around the list.
 *
 * @param startIndex - The starting index to search from.
 * @param direction - `1` to search forward, `-1` to search backward.
 * @param items - The tab items to search; items with `disabled === true` are skipped.
 * @returns The index of the next non-disabled item, or `startIndex` if no enabled item is found.
 */
function getNextIndex(
  startIndex: number,
  direction: 1 | -1,
  items: ExpandableTabItem[]
) {
  let i = startIndex
  for (let steps = 0; steps < items.length; steps += 1) {
    i = (i + direction + items.length) % items.length
    if (!items[i]?.disabled) return i
  }
  return startIndex
}

/**
 * Render a horizontally arranged, keyboard-navigable expandable tab UI with optional deselection and animated label reveal.
 *
 * @param props.items - Array of tab items; each item must include `value`, `label`, and `icon`, and may include `disabled`.
 * @param props.value - Controlled selected tab value; when provided the component operates in controlled mode.
 * @param props.defaultValue - Initial selected tab value for uncontrolled mode.
 * @param props.onValueChange - Callback invoked when the selection changes; receives the new value or `null` when deselected.
 * @param props.allowDeselect - When `true`, clicking the currently selected tab clears the selection.
 * @param props.className - Optional additional class names applied to the container.
 * @returns The rendered ExpandableTabs React element.
 */
export function ExpandableTabs({
  items,
  value,
  defaultValue = null,
  onValueChange,
  allowDeselect = true,
  className,
}: ExpandableTabsProps) {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = React.useState<string | null>(
    defaultValue
  )
  const currentValue = isControlled ? value : internalValue

  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([])

  const setValue = React.useCallback(
    (nextValue: string | null) => {
      if (!isControlled) {
        setInternalValue(nextValue)
      }
      onValueChange?.(nextValue)
    },
    [isControlled, onValueChange]
  )

  const onSelect = React.useCallback(
    (itemValue: string) => {
      if (allowDeselect && currentValue === itemValue) {
        setValue(null)
        return
      }
      setValue(itemValue)
    },
    [allowDeselect, currentValue, setValue]
  )

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (!items.length) return

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault()
        tabRefs.current[getNextIndex(index, 1, items)]?.focus()
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault()
        tabRefs.current[getNextIndex(index, -1, items)]?.focus()
      }
      if (event.key === "Home") {
        event.preventDefault()
        tabRefs.current[getNextIndex(0, 1, items)]?.focus()
      }
      if (event.key === "End") {
        event.preventDefault()
        tabRefs.current[getNextIndex(items.length - 1, -1, items)]?.focus()
      }
    },
    [items]
  )

  return (
    <div
      role="tablist"
      aria-label="Workspace section"
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-xl border border-sidebar-border/80 bg-sidebar p-1",
        className
      )}
    >
      {items.map((item, index) => {
        const Icon = item.icon
        const isSelected = currentValue === item.value

        return (
          <motion.button
            key={item.value}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={`expandable-tab-panel-${item.value}`}
            id={`expandable-tab-${item.value}`}
            tabIndex={isSelected || (currentValue === null && index === 0) ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onSelect(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "text-sidebar-foreground ring-sidebar-ring focus-visible:ring-2 relative inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium outline-hidden transition-colors",
              isSelected
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
              item.disabled && "pointer-events-none opacity-50"
            )}
            animate={{
              paddingInline: isSelected ? "0.75rem" : "0.5rem",
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            <AnimatePresence initial={false}>
              {isSelected && (
                <motion.span
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
            <span className="sr-only">{item.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

export type { ExpandableTabItem, ExpandableTabsProps }
