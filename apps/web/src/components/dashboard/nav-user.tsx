"use client";

import { authClient, useSession } from "@avenire/auth/client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@avenire/ui/components/avatar";
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import { Input } from "@avenire/ui/components/input";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@avenire/ui/components/sidebar";
import {
  Building2,
  Check,
  ChevronsUpDown,
  LogOut,
  Mail,
  Plus,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SensitiveText } from "@/components/shared/sensitive-text";
import { useHaptics } from "@/hooks/use-haptics";
import { usePrivacyMode } from "@/hooks/use-privacy-mode";
import { getFacehashUrl } from "@/lib/avatar";

type WorkspaceSummary = {
  workspaceId: string;
  organizationId?: string;
  rootFolderId: string;
  name: string;
};

type WorkspaceInvitation = {
  id: string;
  organizationId: string;
  organizationName: string;
  inviterName: string | null;
  inviterEmail: string;
};

function getInitials(value: string) {
  return (
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

export function NavUser({
  user,
  workspaces = [],
  invitations = [],
  activeWorkspaceId,
  onSwitchWorkspace,
  onCreateWorkspace,
  onAcceptInvitation,
  onDeclineInvitation,
}: {
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  workspaces?: WorkspaceSummary[];
  invitations?: WorkspaceInvitation[];
  activeWorkspaceId?: string | null;
  onSwitchWorkspace?: (workspace: WorkspaceSummary) => void;
  onCreateWorkspace?: (name: string) => Promise<void> | void;
  onAcceptInvitation?: (invitationId: string) => Promise<void> | void;
  onDeclineInvitation?: (invitationId: string) => Promise<void> | void;
}) {
  const { data: session } = useSession();
  const resolvedUser = user ?? (session?.user
    ? {
        avatar: session.user.image ?? undefined,
        email: session.user.email,
        name: session.user.name ?? "User",
      }
    : {
        email: "signed-out@local",
        name: "Account",
      });
  const { isMobile } = useSidebar();
  const triggerHaptic = useHaptics();
  const fallbackAvatar = useMemo(
    () => getFacehashUrl(resolvedUser.name || resolvedUser.email),
    [resolvedUser.name, resolvedUser.email]
  );
  const privacyMode = usePrivacyMode();
  const initials = getInitials(resolvedUser.name || resolvedUser.email || "User");
  const [avatarSrc, setAvatarSrc] = useState(
    resolvedUser.avatar || fallbackAvatar
  );
  const [avatarErrored, setAvatarErrored] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [createWorkspaceError, setCreateWorkspaceError] = useState<
    string | null
  >(null);

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
    } catch (error) {
      console.error("Failed to sign out", error);
    } finally {
      window.location.assign("/login");
    }
  };

  useEffect(() => {
    if (!avatarErrored) {
      setAvatarSrc(resolvedUser.avatar || fallbackAvatar);
    }
  }, [avatarErrored, fallbackAvatar, resolvedUser.avatar]);

  const activeWorkspace = useMemo(
    () =>
      workspaces.find(
        (workspace) => workspace.workspaceId === activeWorkspaceId
      ) ?? null,
    [activeWorkspaceId, workspaces]
  );
  const activeWorkspaceLabel = activeWorkspace?.name ?? "Active workspace";

  return (
    <>
      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    className="hit-area data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    size="lg"
                  />
                }
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage
                    alt={resolvedUser.name}
                    onError={() => {
                      setAvatarErrored(true);
                      setAvatarSrc(fallbackAvatar);
                    }}
                    src={avatarSrc}
                  />
                  <AvatarFallback className="rounded-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <SensitiveText
                    className="truncate font-medium"
                    privacyMode={privacyMode}
                    value={resolvedUser.name}
                  />
                  <SensitiveText
                    className="truncate text-xs"
                    privacyMode={privacyMode}
                    value={resolvedUser.email}
                  />
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-(--radix-dropdown-menu-trigger-width) min-w-64 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Building2 className="size-4" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">Switch Workspace</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {activeWorkspaceLabel}
                        </p>
                      </div>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-64">
                      {workspaces.map((workspace) => (
                        <DropdownMenuItem
                          key={workspace.workspaceId}
                          onSelect={() => {
                            void triggerHaptic("selection");
                            onSwitchWorkspace?.(workspace);
                          }}
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
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <UserPlus className="size-4" />
                      <div className="min-w-0 flex-1">
                        <p>Workspace invites</p>
                        <p className="text-[10px] text-muted-foreground">
                          {invitations.length} pending
                        </p>
                      </div>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-72">
                      {invitations.length === 0 ? (
                        <DropdownMenuItem disabled>
                          <Mail className="size-4" />
                          No pending invites
                        </DropdownMenuItem>
                      ) : (
                        invitations.map((invite) => (
                          <div
                            className="rounded-md border border-border/60 p-2"
                            key={invite.id}
                          >
                            <p className="truncate font-medium text-xs">
                              {invite.organizationName}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              <SensitiveText
                                className="truncate"
                                privacyMode={privacyMode}
                                value={
                                  invite.inviterName ?? invite.inviterEmail
                                }
                              />
                            </p>
                            <div className="mt-2 flex gap-2">
                              <Button
                                className="h-6 px-2 text-xs"
                                onClick={() => {
                                  void onAcceptInvitation?.(invite.id);
                                }}
                                size="sm"
                                type="button"
                              >
                                Accept
                              </Button>
                              <Button
                                className="h-6 px-2 text-xs"
                                onClick={() => {
                                  void onDeclineInvitation?.(invite.id);
                                }}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Decline
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuGroup>

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    void triggerHaptic("selection");
                    void handleSignOut();
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
              Add a new workspace. You can switch between workspaces from your
              profile menu.
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
                      error instanceof Error
                        ? error.message
                        : "Unable to create workspace."
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
