"use client";

import { Button } from "@avenire/ui/components/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from "@avenire/ui/components/dialog";
import { Input } from "@avenire/ui/components/input";
import { Label } from "@avenire/ui/components/label";
import { ShareNetwork as Share2 } from "@phosphor-icons/react"
import { useEffect, useState } from "react";
import { EmailSuggestionInput } from "@/components/shared/email-suggestion-input";
import type {
  FileRecord,
  FolderRecord,
  ShareSuggestion,
} from "@/components/files/explorer/shared";

interface ShareDialogProps {
  variant: "file" | "folder";
  compact?: boolean;
  segmented?: boolean;
  workspaceUuid: string;
  activeFile?: FileRecord | null;
  currentFolder?: FolderRecord | null;
  isAtWorkspaceRoot?: boolean;
  loadShareSuggestions: (q: string, cb: (s: ShareSuggestion[]) => void) => void;
}

export function ShareDialog({
  variant,
  compact = false,
  segmented = false,
  workspaceUuid,
  activeFile,
  currentFolder,
  isAtWorkspaceRoot = false,
  loadShareSuggestions,
}: ShareDialogProps) {
  const [shareEmail, setShareEmail] = useState("");
  const [shareSuggestions, setShareSuggestions] = useState<ShareSuggestion[]>([]);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [fileSharePermission, setFileSharePermission] = useState<
    "viewer" | "editor"
  >("viewer");
  const [workspaceShareEmail, setWorkspaceShareEmail] = useState("");
  const [workspaceShareSuggestions, setWorkspaceShareSuggestions] = useState<
    ShareSuggestion[]
  >([]);
  const [workspaceShareBusy, setWorkspaceShareBusy] = useState(false);
  const [workspaceShareStatus, setWorkspaceShareStatus] = useState<
    string | null
  >(null);
  const [folderShareEmail, setFolderShareEmail] = useState("");
  const [folderShareSuggestions, setFolderShareSuggestions] = useState<
    ShareSuggestion[]
  >([]);
  const [folderShareBusy, setFolderShareBusy] = useState(false);
  const [folderShareLink, setFolderShareLink] = useState<string | null>(null);
  const [folderShareStatus, setFolderShareStatus] = useState<string | null>(
    null
  );
  const [folderSharePermission, setFolderSharePermission] = useState<
    "viewer" | "editor"
  >("viewer");

  useEffect(() => {
    if (variant !== "file" || !workspaceUuid) {
      setShareSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      void loadShareSuggestions(shareEmail, setShareSuggestions);
    }, 150);
    return () => clearTimeout(timer);
  }, [loadShareSuggestions, shareEmail, variant, workspaceUuid]);

  useEffect(() => {
    if (variant !== "folder" || !workspaceUuid) {
      setWorkspaceShareSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      void loadShareSuggestions(workspaceShareEmail, setWorkspaceShareSuggestions);
    }, 150);
    return () => clearTimeout(timer);
  }, [loadShareSuggestions, workspaceShareEmail, variant, workspaceUuid]);

  useEffect(() => {
    if (variant !== "folder" || !workspaceUuid || isAtWorkspaceRoot) {
      setFolderShareSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      void loadShareSuggestions(folderShareEmail, setFolderShareSuggestions);
    }, 150);
    return () => clearTimeout(timer);
  }, [
    folderShareEmail,
    isAtWorkspaceRoot,
    loadShareSuggestions,
    variant,
    workspaceUuid,
  ]);

  const shareActiveFileWithEmail = async () => {
    if (
      variant !== "file" ||
      !(activeFile && workspaceUuid && shareEmail.trim()) ||
      activeFile.readOnly
    ) {
      return;
    }

    setShareBusy(true);
    setShareStatus(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/files/${activeFile.id}/share/grants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: shareEmail.trim(),
            permission: fileSharePermission,
          }),
        }
      );
      if (!response.ok) {
        setShareStatus("Unable to add access.");
        return;
      }
      setShareEmail("");
      setShareStatus("Access granted.");
    } finally {
      setShareBusy(false);
    }
  };

  const generateActiveFileShareLink = async () => {
    if (variant !== "file" || !(activeFile && workspaceUuid) || activeFile.readOnly) {
      return;
    }
    setShareBusy(true);
    setShareStatus(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/files/${activeFile.id}/share/link`,
        { method: "POST" }
      );
      if (!response.ok) {
        setShareStatus("Unable to generate link.");
        return;
      }
      const payload = (await response.json()) as { shareUrl?: string };
      if (payload.shareUrl) {
        setShareLink(payload.shareUrl);
        setShareStatus("Share link generated.");
      }
    } finally {
      setShareBusy(false);
    }
  };

  const shareCurrentFolderWithEmail = async () => {
    if (
      variant !== "folder" ||
      !(
        currentFolder &&
        workspaceUuid &&
        folderShareEmail.trim() &&
        !isAtWorkspaceRoot
      ) ||
      currentFolder.readOnly
    ) {
      return;
    }

    setFolderShareBusy(true);
    setFolderShareStatus(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/folders/${currentFolder.id}/share/grants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: folderShareEmail.trim(),
            permission: folderSharePermission,
          }),
        }
      );
      if (!response.ok) {
        setFolderShareStatus("Unable to add access.");
        return;
      }
      const payload = (await response.json()) as { shareUrl?: string };
      setFolderShareEmail("");
      setFolderShareLink(payload.shareUrl ?? null);
      setFolderShareStatus("Access granted.");
    } finally {
      setFolderShareBusy(false);
    }
  };

  const generateCurrentFolderShareLink = async () => {
    if (
      variant !== "folder" ||
      !(currentFolder && workspaceUuid) ||
      isAtWorkspaceRoot ||
      currentFolder.readOnly
    ) {
      return;
    }
    setFolderShareBusy(true);
    setFolderShareStatus(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/folders/${currentFolder.id}/share/link`,
        { method: "POST" }
      );
      if (!response.ok) {
        setFolderShareStatus("Unable to generate link.");
        return;
      }
      const payload = (await response.json()) as { shareUrl?: string };
      if (payload.shareUrl) {
        setFolderShareLink(payload.shareUrl);
        setFolderShareStatus("Share link generated.");
      }
    } finally {
      setFolderShareBusy(false);
    }
  };

  const shareWorkspaceWithEmail = async () => {
    if (variant !== "folder" || !(workspaceUuid && workspaceShareEmail.trim())) {
      return;
    }
    setWorkspaceShareBusy(true);
    setWorkspaceShareStatus(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/share/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: workspaceShareEmail.trim() }),
        }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setWorkspaceShareStatus(payload.error ?? "Unable to share workspace.");
        return;
      }
      const payload = (await response.json()) as { status?: string };
      setWorkspaceShareEmail("");
      setWorkspaceShareStatus(
        payload.status === "added"
          ? "Workspace shared."
          : payload.status === "invited"
            ? "Invitation sent."
            : "Workspace shared."
      );
    } finally {
      setWorkspaceShareBusy(false);
    }
  };

  const notifyWorkspaceTeam = async () => {
    if (variant !== "folder" || !workspaceUuid) {
      return;
    }
    setWorkspaceShareBusy(true);
    setWorkspaceShareStatus(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/share/team`,
        {
          method: "POST",
        }
      );
      if (!response.ok) {
        setWorkspaceShareStatus("Unable to notify team.");
        return;
      }
      const payload = (await response.json()) as {
        emailSentCount?: number;
        queued?: boolean;
        recipients?: number;
      };
      if (payload.queued) {
        setWorkspaceShareStatus(
          `Workspace notifications queued for ${payload.recipients ?? 0} teammates.`
        );
        return;
      }
      setWorkspaceShareStatus(
        `Workspace notification sent to ${payload.emailSentCount ?? 0} teammates.`
      );
    } finally {
      setWorkspaceShareBusy(false);
    }
  };

  if (variant === "file") {
    if (!activeFile || activeFile.readOnly) {
      return null;
    }

    return (
      <Dialog>
        <DialogTrigger
          render={
            <Button
              className={
                segmented
                  ? "h-9 w-9 rounded-none border-0 bg-transparent shadow-none"
                  : compact
                    ? "h-7 w-7"
                    : "size-5"
              }
              size="icon-xs"
              type="button"
              variant={segmented ? "ghost" : "ghost"}
            />
          }
        >
          <Share2 className="size-3" />
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share file</DialogTitle>
            <DialogDescription>
              Grant viewer or editor access by email, or create a signed link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="file-share-permission">Permission</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              id="file-share-permission"
              onChange={(event) =>
                setFileSharePermission(
                  event.target.value === "editor" ? "editor" : "viewer"
                )
              }
              value={fileSharePermission}
            >
              <option value="viewer">Viewer (read-only)</option>
              <option value="editor">Editor</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="file-share-email">Add people</Label>
            <div className="flex items-center gap-2">
              <EmailSuggestionInput
                id="file-share-email"
                onFocus={() => {
                  void loadShareSuggestions(shareEmail, setShareSuggestions);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") {
                    return;
                  }
                  event.preventDefault();
                  shareActiveFileWithEmail().catch(() => undefined);
                }}
                onValueChange={setShareEmail}
                placeholder="name@example.com"
                suggestions={shareSuggestions}
                value={shareEmail}
              />
              <Button
                disabled={shareBusy}
                onClick={() => {
                  shareActiveFileWithEmail().catch(() => undefined);
                }}
                size="sm"
                type="button"
                variant="secondary"
              >
                Add
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Share link (7 days)</Label>
            <div className="flex items-center gap-2">
              <Input readOnly value={shareLink ?? ""} />
              <Button
                disabled={shareBusy}
                onClick={() => {
                  void generateActiveFileShareLink();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Generate
              </Button>
              <Button
                disabled={!shareLink}
                onClick={() => {
                  if (!shareLink) {
                    return;
                  }
                  navigator.clipboard.writeText(shareLink).catch(() => {
                    setShareStatus("Unable to copy link.");
                  });
                  setShareStatus("Link copied.");
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Copy
              </Button>
            </div>
          </div>
          {shareStatus ? (
            <p className="text-muted-foreground text-xs">{shareStatus}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            className={
              segmented
                ? "h-9 rounded-none border-0 bg-transparent px-3 text-xs shadow-none"
                : compact
                ? "h-7 gap-1.5 rounded-md px-2 text-xs"
                : "rounded-md"
            }
            size="sm"
            type="button"
            variant="outline"
          />
        }
      >
        <Share2 className={compact ? "size-3" : "size-3.5"} />
        Share
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isAtWorkspaceRoot ? "Share workspace" : "Share folder"}
          </DialogTitle>
          <DialogDescription>
            {isAtWorkspaceRoot
              ? "Add a teammate by email, or notify the whole team with a workspace link."
              : "Grant viewer or editor access by email, or create a signed folder link."}
          </DialogDescription>
        </DialogHeader>
        {isAtWorkspaceRoot ? null : (
          <div className="space-y-2">
            <Label htmlFor="folder-share-permission">Permission</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              id="folder-share-permission"
              onChange={(event) =>
                setFolderSharePermission(
                  event.target.value === "editor" ? "editor" : "viewer"
                )
              }
              value={folderSharePermission}
            >
              <option value="viewer">Viewer (read-only)</option>
              <option value="editor">Editor</option>
            </select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="workspace-share-email">
            {isAtWorkspaceRoot ? "Add teammate" : "Add people"}
          </Label>
          <div className="flex items-center gap-2">
            <EmailSuggestionInput
              id="workspace-share-email"
              onFocus={() => {
                void loadShareSuggestions(
                  isAtWorkspaceRoot ? workspaceShareEmail : folderShareEmail,
                  isAtWorkspaceRoot
                    ? setWorkspaceShareSuggestions
                    : setFolderShareSuggestions
                );
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }
                event.preventDefault();
                if (isAtWorkspaceRoot) {
                  shareWorkspaceWithEmail().catch(() => undefined);
                  return;
                }
                shareCurrentFolderWithEmail().catch(() => undefined);
              }}
              onValueChange={
                isAtWorkspaceRoot ? setWorkspaceShareEmail : setFolderShareEmail
              }
              placeholder="name@example.com"
              suggestions={
                isAtWorkspaceRoot
                  ? workspaceShareSuggestions
                  : folderShareSuggestions
              }
              value={isAtWorkspaceRoot ? workspaceShareEmail : folderShareEmail}
            />
            <Button
              disabled={isAtWorkspaceRoot ? workspaceShareBusy : folderShareBusy}
              onClick={() => {
                if (isAtWorkspaceRoot) {
                  shareWorkspaceWithEmail().catch(() => undefined);
                  return;
                }
                shareCurrentFolderWithEmail().catch(() => undefined);
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              Add
            </Button>
          </div>
        </div>
        {isAtWorkspaceRoot ? null : (
          <div className="space-y-2">
            <Label>Share link (7 days)</Label>
            <div className="flex items-center gap-2">
              <Input readOnly value={folderShareLink ?? ""} />
              <Button
                disabled={folderShareBusy}
                onClick={() => {
                  void generateCurrentFolderShareLink();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Generate
              </Button>
              <Button
                disabled={!folderShareLink}
                onClick={() => {
                  if (!folderShareLink) {
                    return;
                  }
                  navigator.clipboard.writeText(folderShareLink).catch(() => {
                    setFolderShareStatus("Unable to copy link.");
                  });
                  setFolderShareStatus("Link copied.");
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Copy
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          {isAtWorkspaceRoot ? (
            <Button
              disabled={workspaceShareBusy}
              onClick={() => {
                void notifyWorkspaceTeam();
              }}
              type="button"
              variant="outline"
            >
              Notify whole team
            </Button>
          ) : null}
        </DialogFooter>
        {isAtWorkspaceRoot && workspaceShareStatus ? (
          <p className="text-muted-foreground text-xs">{workspaceShareStatus}</p>
        ) : null}
        {!isAtWorkspaceRoot && folderShareStatus ? (
          <p className="text-muted-foreground text-xs">{folderShareStatus}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
