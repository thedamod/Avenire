"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, House } from "lucide-react";
import { Button } from "@avenire/ui/components/button";
import { SidebarTrigger } from "@avenire/ui/components/sidebar";
import { cn } from "@avenire/ui/lib/utils";
import type { ReactNode } from "react";
import { useWorkspaceHistoryStore } from "@/stores/workspaceHistoryStore";

interface WorkspaceHeaderProps {
  actions?: ReactNode;
  className?: string;
  leadingIcon?: ReactNode;
  homeHref?: string;
  children?: ReactNode;
}

export function WorkspaceHeader({
  actions,
  className,
  children,
  leadingIcon,
  homeHref = "/workspace",
}: WorkspaceHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const historyEntries = useWorkspaceHistoryStore((state) => state.entries);
  const historyIndex = useWorkspaceHistoryStore((state) => state.index);

  const backRoute =
    historyIndex > 0 ? (historyEntries[historyIndex - 1] ?? null) : null;
  const forwardRoute =
    historyIndex >= 0 && historyIndex < historyEntries.length - 1
      ? (historyEntries[historyIndex + 1] ?? null)
      : null;
  const isHome = pathname === homeHref;

  return (
    <header
      className={cn(
        "sticky top-0 z-30 shrink-0 border-border/70 border-b bg-background/95 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SidebarTrigger className="rounded-md" />
          {leadingIcon ? (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground">
              {leadingIcon}
            </div>
          ) : null}
          <Button
            aria-label="Go back"
            className="rounded-md"
            disabled={!backRoute}
            onClick={() => {
              if (backRoute) {
                router.push(backRoute as Route);
              }
            }}
            size="icon-xs"
            type="button"
            variant="outline"
          >
            <ArrowLeft className="size-3.5" />
          </Button>
          <Button
            aria-label="Go forward"
            className="hidden rounded-md sm:inline-flex"
            disabled={!forwardRoute}
            onClick={() => {
              if (forwardRoute) {
                router.push(forwardRoute as Route);
              }
            }}
            size="icon-xs"
            type="button"
            variant="outline"
          >
            <ArrowRight className="size-3.5" />
          </Button>
          <Button
            aria-label="Go home"
            className="hidden rounded-md sm:inline-flex"
            disabled={isHome}
            onClick={() => {
              if (!isHome) {
                router.push(homeHref as Route);
              }
            }}
            size="icon-xs"
            type="button"
            variant="outline"
          >
            <House className="size-3.5" />
          </Button>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
