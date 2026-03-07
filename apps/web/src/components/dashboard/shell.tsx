import {
  SidebarInset,
  SidebarProvider,
} from "@avenire/ui/components/sidebar";
import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/dashboard/app-sidebar";
import type { ChatSummary } from "@/lib/chat-data";

interface DashboardLayoutProps {
  user: {
    name: string;
    email: string;
    avatar?: string;
  };
  initialChats: ChatSummary[];
  activeChatSlug?: string;
  children: ReactNode;
}

/**
 * Render the dashboard layout with a sidebar and main content area.
 *
 * @param user - The current user's profile (name, email, optional avatar) displayed in the sidebar.
 * @param initialChats - Array of chat summaries to populate the sidebar's chat list.
 * @param activeChatSlug - Slug identifying the active chat; when undefined, no chat is selected.
 * @param children - Content to render inside the layout's main content area.
 * @returns The JSX element for the dashboard shell containing the sidebar and content region.
 */
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
      </SidebarInset>
    </SidebarProvider>
  );
}
