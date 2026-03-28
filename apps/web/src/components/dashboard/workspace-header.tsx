"use client";

import { Button } from "@avenire/ui/components/button";
import { ButtonGroup } from "@avenire/ui/components/button-group";
import { SidebarTrigger } from "@avenire/ui/components/sidebar";
import { cn } from "@avenire/ui/lib/utils";
import { ArrowLeft, ArrowRight, House } from "@phosphor-icons/react"
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useHeaderStore } from "@/stores/header-store";
import { useWorkspaceHistoryStore } from "@/stores/workspaceHistoryStore";

interface WorkspaceHeaderProps {
  className?: string;
  homeHref?: string;
}

export function WorkspaceHeader({
  className,
  homeHref = "/workspace",
}: WorkspaceHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const leadingIcon = useHeaderStore((state) => state.leadingIcon);
  const breadcrumbs = useHeaderStore((state) => state.breadcrumbs);
  const actions = useHeaderStore((state) => state.actions);
  const title = useHeaderStore((state) => state.title);
  const historyEntries = useWorkspaceHistoryStore((state) => state.entries);
  const historyIndex = useWorkspaceHistoryStore((state) => state.index);

  const backRoute =
    historyIndex > 0 ? (historyEntries[historyIndex - 1] ?? null) : null;
  const forwardRoute =
    historyIndex >= 0 && historyIndex < historyEntries.length - 1
      ? (historyEntries[historyIndex + 1] ?? null)
      : null;
  const isHome = pathname === homeHref;

  const segmentedGroupClass =
    "self-center divide-x divide-border/60 overflow-hidden rounded-md border border-border/60 bg-background shadow-sm";
  const segmentedIconButtonClass =
    "size-10 rounded-none border-0 bg-transparent text-foreground shadow-none hover:bg-muted/70 disabled:bg-transparent";

  return (
    <header
      className={cn(
        "sticky top-0 z-30 shrink-0 border-border/40 border-b bg-background",
        className
      )}
    >
      <div className="flex min-h-14 shrink-0 flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-1.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5 sm:flex-1">
          <ButtonGroup className={segmentedGroupClass}>
            <Button
              aria-label="Go back"
              className={segmentedIconButtonClass}
              disabled={!backRoute}
              onClick={() => {
                if (backRoute) {
                  router.push(backRoute as Route);
                }
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ArrowLeft className="size-3.5" />
            </Button>
            <Button
              aria-label="Go forward"
              className={segmentedIconButtonClass}
              disabled={!forwardRoute}
              onClick={() => {
                if (forwardRoute) {
                  router.push(forwardRoute as Route);
                }
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ArrowRight className="size-3.5" />
            </Button>
            <Button
              aria-label="Go home"
              className={segmentedIconButtonClass}
              disabled={isHome}
              onClick={() => {
                router.push(homeHref as Route);
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <House className="size-3.5" />
            </Button>
          </ButtonGroup>
          <SidebarTrigger className="self-center size-10 rounded-md border border-border/60 bg-background text-muted-foreground shadow-sm hover:bg-muted/70" />
          <div className="hidden min-w-0 flex-1 items-center gap-1.5 sm:flex">
            <div className="hidden size-6 shrink-0 items-center justify-center text-muted-foreground sm:flex">
              {leadingIcon ?? (
                <div
                  className="flex size-6 shrink-0 items-center justify-center text-muted-foreground empty:hidden"
                  id="workspace-header-leading-icon"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              {breadcrumbs ?? (
                <div className="min-w-0 flex-1" id="workspace-header-breadcrumbs">
                  {title ? (
                    <h1 className="truncate font-medium text-sm text-foreground">
                      {title}
                    </h1>
                  ) : null}
                </div>
              )}
            </div>
          </div>
          <div className="ml-auto flex min-w-0 items-center justify-end overflow-x-auto no-scrollbar sm:hidden">
            {actions}
          </div>
        </div>
        <div className="min-w-0 sm:hidden">
          {breadcrumbs ?? (
            <div className="min-w-0" id="workspace-header-breadcrumbs">
              {title ? (
                <h1 className="truncate font-medium text-sm text-foreground">
                  {title}
                </h1>
              ) : null}
            </div>
          )}
        </div>
        <div className="hidden min-w-0 justify-end overflow-x-auto no-scrollbar sm:flex sm:w-auto">
          {actions}
        </div>
      </div>
    </header>
  );
}
