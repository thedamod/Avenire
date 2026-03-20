import { SidebarInset, SidebarProvider } from "@avenire/ui/components/sidebar";
import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/dashboard/app-sidebar";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { QuickCaptureHost } from "@/components/dashboard/quick-capture-host";
import { UploadActivityPanel } from "@/components/files/upload-activity-panel";
import type { ChatSummary } from "@/lib/chat-data";

interface DashboardLayoutProps {
  activeChatSlug?: string;
  children: ReactNode;
  initialChats: ChatSummary[];
  user: {
    name: string;
    email: string;
    avatar?: string;
  };
}

export function DashboardLayout({
  user,
  initialChats,
  activeChatSlug,
  children,
}: DashboardLayoutProps) {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <DashboardSidebar
        activeChatSlug={activeChatSlug ?? ""}
        initialChats={initialChats}
        user={user}
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
