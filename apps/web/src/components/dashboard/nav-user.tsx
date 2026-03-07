"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Bell,
  Building2,
  Check,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Plus,
  Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@avenire/ui/components/avatar";
import { Button } from "@avenire/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@avenire/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import { Input } from "@avenire/ui/components/input";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@avenire/ui/components/sidebar";
import { getFacehashUrl } from "@/lib/avatar";

type WorkspaceSummary = {
  workspaceId: string;
  rootFolderId: string;
  name: string;
};

/**
 * Renders a profile menu with user info, workspace switching, and a create-workspace dialog.
 *
 * @param user - User display data containing name, email, and optional avatar URL
 * @param workspaces - Available workspaces to list in the menu
 * @param activeWorkspaceId - ID of the currently active workspace; the matching workspace is highlighted
 * @param onSwitchWorkspace - Optional callback invoked with the selected workspace when a workspace is chosen
 * @param onCreateWorkspace - Optional callback invoked with the trimmed workspace name when creating a new workspace
 * @returns The JSX element for the user dropdown menu and workspace creation dialog
 */
export function NavUser({
  user,
  workspaces = [],
  activeWorkspaceId,
  onSwitchWorkspace,
  onCreateWorkspace,
}: {
  user: {
    name: string;
    email: string;
    avatar?: string;
  };
  workspaces?: WorkspaceSummary[];
  activeWorkspaceId?: string | null;
  onSwitchWorkspace?: (workspace: WorkspaceSummary) => void;
  onCreateWorkspace?: (name: string) => Promise<void> | void;
}) {
  const { isMobile } = useSidebar();
  const fallbackAvatar = getFacehashUrl(user.name || user.email);
  const [avatarSrc, setAvatarSrc] = useState(user.avatar || fallbackAvatar);
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  useEffect(() => {
    setAvatarSrc(user.avatar || fallbackAvatar);
  }, [fallbackAvatar, user.avatar]);

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <SidebarMenuButton
              render={<DropdownMenuTrigger />}
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage
                  src={avatarSrc}
                  alt={user.name}
                  onError={() => setAvatarSrc(fallbackAvatar)}
                />
                <AvatarFallback className="rounded-lg">CN</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage
                        src={avatarSrc}
                        alt={user.name}
                        onError={() => setAvatarSrc(fallbackAvatar)}
                      />
                      <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-xs">{user.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Workspaces
                </DropdownMenuLabel>
                {workspaces.map((workspace) => (
                  <DropdownMenuItem
                    key={workspace.workspaceId}
                    onSelect={() => onSwitchWorkspace?.(workspace)}
                  >
                    <Building2 className="size-4" />
                    <span className="truncate">{workspace.name}</span>
                    {workspace.workspaceId === activeWorkspaceId ? (
                      <Check className="ml-auto size-4" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setCreateOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  Create workspace
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <Sparkles />
                  Upgrade to Pro
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <BadgeCheck />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <CreditCard />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Bell />
                  Notifications
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Add a new workspace. You can switch between workspaces from your profile menu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="font-medium text-sm" htmlFor="workspace-name">
              Workspace name
            </label>
            <Input
              autoFocus
              id="workspace-name"
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Product Design"
              value={workspaceName}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setCreateOpen(false);
                setWorkspaceName("");
              }}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={creatingWorkspace || workspaceName.trim().length === 0}
              onClick={() => {
                if (!workspaceName.trim()) {
                  return;
                }
                void (async () => {
                  setCreatingWorkspace(true);
                  try {
                    await onCreateWorkspace?.(workspaceName.trim());
                    setCreateOpen(false);
                    setWorkspaceName("");
                  } finally {
                    setCreatingWorkspace(false);
                  }
                })();
              }}
              type="button"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
