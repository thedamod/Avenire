"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@avenire/ui/components/command";
import { Input } from "@avenire/ui/components/input";
import type { KeyboardEventHandler } from "react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface EmailSuggestion {
  email: string;
  name: string | null;
}

export function EmailSuggestionInput({
  id,
  placeholder,
  suggestions,
  type = "email",
  value,
  onFocus,
  onKeyDown,
  onValueChange,
}: {
  id?: string;
  placeholder?: string;
  suggestions: EmailSuggestion[];
  type?: "email" | "text";
  value: string;
  onFocus?: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onValueChange: (value: string) => void;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const normalizedValue = value.trim().toLowerCase();
  const filteredSuggestions = useMemo(
    () =>
      suggestions.filter(
        (item) => item.email.trim().toLowerCase() !== normalizedValue
      ),
    [normalizedValue, suggestions]
  );
  const open = isFocused && filteredSuggestions.length > 0;

  return (
    <div className="relative w-full">
      <Input
        id={id}
        onBlur={() => {
          window.setTimeout(() => setIsFocused(false), 120);
        }}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={() => {
          setIsFocused(true);
          onFocus?.();
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      <div
        className={cn(
          "absolute top-full z-50 mt-1 w-full rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md transition-opacity",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        )}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandEmpty>No suggestions</CommandEmpty>
            <CommandGroup heading="Suggestions">
              {filteredSuggestions.map((item) => (
                <CommandItem
                  key={item.email}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onSelect={() => {
                    onValueChange(item.email);
                    setIsFocused(false);
                  }}
                  value={item.email}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{item.name ?? item.email}</span>
                    {item.name ? (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {item.email}
                      </span>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </div>
  );
}
