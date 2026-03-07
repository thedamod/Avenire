"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import {
  BadgeCheck,
  Bell,
  Building2,
  Check,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Plus,
  Settings,
  Shield,
  Sparkles,
} from "lucide-react";
import { authClient } from "@avenire/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@avenire/ui/components/avatar";
import { Button } from "@avenire/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useRouter } from "next/navigation";

type WorkspaceSummary = {
  workspaceId: string;
  organizationId?: string;
  rootFolderId: string;
  name: string;
};

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "U";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

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
  const router = useRouter();
  const fallbackAvatar = getFacehashUrl(user.name || user.email);
  const initials = getInitials(user.name || user.email || "User");
  const [avatarSrc, setAvatarSrc] = useState(user.avatar || fallbackAvatar);
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null);

  useEffect(() => {
    setAvatarSrc(user.avatar || fallbackAvatar);
  }, [fallbackAvatar, user.avatar]);

  return (
    <>
      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  />
                }
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage
                    src={avatarSrc}
                    alt={user.name}
                    onError={() => setAvatarSrc(fallbackAvatar)}
                  />
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </DropdownMenuTrigger>
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
                        <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
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
                  <DialogTrigger render={<DropdownMenuItem />}>
                    <Plus className="size-4" />
                    Create workspace
                  </DialogTrigger>
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
                  <DropdownMenuItem
                    onSelect={() => router.push("/settings?tab=account" as Route)}
                  >
                    <BadgeCheck />
                    Account
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => router.push("/settings?tab=billing" as Route)}
                  >
                    <CreditCard />
                    Billing
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => router.push("/settings?tab=security" as Route)}
                  >
                    <Shield />
                    Security
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => router.push("/settings" as Route)}
                  >
                    <Settings />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    void (async () => {
                      try {
                        await authClient.signOut();
                      } catch (error) {
                        console.error("Failed to sign out", error);
                      } finally {
                        router.push("/login" as Route);
                      }
                    })();
                  }}
                >
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>

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
              onChange={(event) => {
                setWorkspaceName(event.target.value);
                if (createWorkspaceError) {
                  setCreateWorkspaceError(null);
                }
              }}
              placeholder="Product Design"
              value={workspaceName}
            />
            {createWorkspaceError ? (
              <p className="text-destructive text-xs">{createWorkspaceError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setCreateOpen(false);
                setWorkspaceName("");
                setCreateWorkspaceError(null);
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
                    setCreateWorkspaceError(null);
                  } catch (error) {
                    setCreateWorkspaceError(
                      error instanceof Error ? error.message : "Unable to create workspace.",
                    );
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
