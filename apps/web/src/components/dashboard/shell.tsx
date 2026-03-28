"use client";

import { SidebarInset, SidebarProvider } from "@avenire/ui/components/sidebar";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { Suspense, useEffect, useState } from "react";
import { DashboardSidebar } from "@/components/dashboard/app-sidebar";
import { WorkspaceHeader } from "@/components/dashboard/workspace-header";
import { useDashboardOverlayStore } from "@/stores/dashboardOverlayStore";
import { useDashboardUiStore } from "@/stores/dashboardUiStore";

const DeferredCommandPalette = dynamic(
  () =>
    import("@/components/dashboard/command-palette").then((module) => ({
      default: module.CommandPalette,
    })),
  { loading: () => null }
);

const DeferredQuickCaptureHost = dynamic(
  () =>
    import("@/components/dashboard/quick-capture-host").then((module) => ({
      default: module.QuickCaptureHost,
    })),
  { loading: () => null }
);

const DeferredWorkspaceRealtimeBridge = dynamic(
  () =>
    import("@/components/dashboard/workspace-realtime-bridge").then(
      (module) => ({
        default: module.WorkspaceRealtimeBridge,
      })
    ),
  { loading: () => null, ssr: false }
);

const DeferredUploadActivityPanel = dynamic(
  () =>
    import("@/components/files/upload-activity-panel").then((module) => ({
      default: module.UploadActivityPanel,
    })),
  { loading: () => null }
);

const DeferredSettingsDialog = dynamic(
  () =>
    import("@/components/settings/settings-dialog").then((module) => ({
      default: module.SettingsDialog,
    })),
  { loading: () => null }
);

const DeferredTrashDialog = dynamic(
  () =>
    import("@/components/dashboard/trash-dialog").then((module) => ({
      default: module.TrashDialog,
    })),
  { loading: () => null }
);

interface DashboardLayoutProps {
  activeChatSlug?: string;
  activeWorkspace?: {
    name?: string;
    rootFolderId: string;
    workspaceId: string;
  } | null;
  children: ReactNode;
  initialWorkspaces?: Array<{
    logo: string | null;
    workspaceId: string;
    organizationId: string;
    rootFolderId: string;
    name: string;
  }>;
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
}

export function DashboardLayout({
  user,
  activeChatSlug,
  activeWorkspace,
  initialWorkspaces,
  children,
}: DashboardLayoutProps) {
  const [deferredReady, setDeferredReady] = useState(false);
  const settingsOpen = useDashboardOverlayStore((state) => state.settingsOpen);
  const settingsTab = useDashboardOverlayStore((state) => state.settingsTab);
  const setSettingsOpen = useDashboardOverlayStore(
    (state) => state.setSettingsOpen
  );
  const setSettingsTab = useDashboardOverlayStore(
    (state) => state.setSettingsTab
  );
  const trashOpen = useDashboardOverlayStore((state) => state.trashOpen);
  const setTrashOpen = useDashboardOverlayStore((state) => state.setTrashOpen);

  useEffect(() => {
    useDashboardUiStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (deferredReady || typeof window === "undefined") {
      return;
    }

    const markReady = () => {
      setDeferredReady(true);
    };

    const cleanupListeners = () => {
      window.removeEventListener("pointerdown", markReady);
      window.removeEventListener("keydown", markReady);
      window.removeEventListener("focusin", markReady);
    };

    window.addEventListener("pointerdown", markReady, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", markReady, { once: true });
    window.addEventListener("focusin", markReady, { once: true });

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(() => {
        markReady();
      });
      return () => {
        cleanupListeners();
        window.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = globalThis.setTimeout(markReady, 1500);
    return () => {
      cleanupListeners();
      globalThis.clearTimeout(timeoutId);
    };
  }, [deferredReady]);

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Suspense fallback={null}>
        <DashboardSidebar
          activeChatSlug={activeChatSlug ?? ""}
          activeWorkspace={activeWorkspace}
          initialWorkspaces={initialWorkspaces}
          user={user}
        />
      </Suspense>
      {deferredReady ? (
        <DeferredWorkspaceRealtimeBridge
          workspaceUuid={activeWorkspace?.workspaceId ?? null}
        />
      ) : null}
      <SidebarInset className="relative min-h-0 overflow-hidden bg-background md:peer-data-[variant=inset]:mb-0">
        <WorkspaceHeader />
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        {deferredReady ? (
          <>
            <DeferredQuickCaptureHost />
            <DeferredCommandPalette />
            <DeferredUploadActivityPanel />
          </>
        ) : null}
      </SidebarInset>
      {settingsOpen ? (
        <DeferredSettingsDialog
          initialTab={settingsTab ?? "account"}
          initialWorkspaceId={activeWorkspace?.workspaceId}
          initialWorkspaces={initialWorkspaces}
          onOpenChange={(open) => {
            setSettingsOpen(open);
            if (!open) {
              setSettingsTab(null);
            }
          }}
          open={settingsOpen}
        />
      ) : null}
      {trashOpen && activeWorkspace?.workspaceId ? (
        <DeferredTrashDialog
          onOpenChange={setTrashOpen}
          open={trashOpen}
          workspaceUuid={activeWorkspace.workspaceId}
        />
      ) : null}
    </SidebarProvider>
  );
}
