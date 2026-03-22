"use client"

import { SidebarInset, SidebarProvider } from "@avenire/ui/components/sidebar";
import type { ReactNode } from "react";
import { Suspense, useEffect } from "react";
import { DashboardSidebar } from "@/components/dashboard/app-sidebar";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { QuickCaptureHost } from "@/components/dashboard/quick-capture-host";
import { WorkspaceRealtimeBridge } from "@/components/dashboard/workspace-realtime-bridge";
import { UploadActivityPanel } from "@/components/files/upload-activity-panel";
import { useDashboardUiStore } from "@/stores/dashboardUiStore";

interface DashboardLayoutProps {
  activeChatSlug?: string;
  activeWorkspace?: {
    name?: string;
    rootFolderId: string;
    workspaceId: string;
  } | null;
  initialWorkspaces?: Array<{
    workspaceId: string;
    organizationId: string;
    rootFolderId: string;
    name: string;
  }>;
  children: ReactNode;
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
  useEffect(() => {
    useDashboardUiStore.persist.rehydrate();
  }, []);

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
      <WorkspaceRealtimeBridge
        workspaceUuid={activeWorkspace?.workspaceId ?? null}
      />
      <SidebarInset className="relative min-h-0 overflow-hidden bg-background md:peer-data-[variant=inset]:mb-0">
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        <QuickCaptureHost />
        <CommandPalette />
        <UploadActivityPanel />
      </SidebarInset>
    </SidebarProvider>
  );
}
