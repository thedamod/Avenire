"use client";

import { Button } from "@avenire/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import { FileMediaPlayer } from "@avenire/ui/media";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUp,
  Copy,
  FileText,
  FileImage,
  FolderInput,
  Info,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Share2,
  Trash2,
  XCircle,
} from "lucide-react";
import dynamic from "next/dynamic";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import AvenireEditor from "@/components/editor";
import { PropertiesTable } from "@/components/editor/properties-table";
import type {
  FileRecord,
  FolderRecord,
  ShareSuggestion,
  WorkspaceMemberRecord,
} from "@/components/files/explorer/shared";
import {
  detectPreviewKind,
  toUpdatedLabel,
} from "@/components/files/explorer/shared";
import { ShareDialog } from "@/components/files/explorer/share-dialog";
import type { WorkspaceSearchResult } from "@/components/files/stylized-search-bar";
import {
  getWarmState,
  isFileOpenedCached,
  markFileOpened,
  primeMediaPlayback,
  releaseMediaPlaybackPrime,
} from "@/lib/file-preview-cache";
import {
  arePageMetadataStatesEqual,
  EMPTY_PAGE_METADATA_STATE,
  type PageMetadataState,
  normalizePageMetadataState,
  resolvePageDocument,
  splitFrontmatterDocument,
  updateContentWithFrontmatter,
} from "@/lib/frontmatter";
import {
  buildProgressivePlaybackSource,
  buildVideoPlaybackDescriptor,
} from "@/lib/media-playback";
import {
  readWorkspaceMarkdownCache,
  writeWorkspaceMarkdownCache,
} from "@/lib/workspace-markdown-cache";

const PDFViewer = dynamic(() => import("@/components/files/pdf-viewer"), {
  loading: () => (
    <div className="flex h-[70vh] items-center justify-center rounded-xl border border-border/70 bg-card text-sm">
      Loading PDF...
    </div>
  ),
  ssr: false,
});

interface FilePreviewPanelProps {
  activeFile: FileRecord;
  workspaceUuid: string;
  currentFolderId: string;
  allFiles: FileRecord[];
  allFolders: FolderRecord[];
  query: string;
  retrievalResults: WorkspaceSearchResult[];
  activeRetrievalChunkId: string | null;
  selectFile: (fileId: string | null) => void;
  openFileById: (fileId: string) => void;
  openRenameFileDialog: (file: FileRecord) => void;
  deleteSelectionItems: (items: { id: string; kind: "file" | "folder" }[]) => void;
  moveFile: (fileId: string, targetFolderId: string) => Promise<void>;
  duplicateItem: (item: {
    id: string;
    kind: "file" | "folder";
    parentId?: string | null;
  }) => void;
  downloadFileDirect: (file: FileRecord) => void;
  copyFileShareLink: (file: FileRecord) => void;
  downloadItemArchive: (item: {
    id: string;
    kind: "file" | "folder";
    name: string;
  }) => void;
  toggleCurrentPinnedItem: () => void;
  isCurrentPinned: boolean;
  currentInfoEntries: { label: string; value: string }[];
  wikiMarkdownFiles: Array<{
    id: string;
    title: string;
    excerpt: string;
    content: string;
  }>;
  filePathById: Map<string, string>;
  workspaceMembers: WorkspaceMemberRecord[];
  startBannerUpload: (...args: any[]) => Promise<any>;
  startUpload: (...args: any[]) => Promise<any>;
  loadShareSuggestions: (q: string, cb: (s: ShareSuggestion[]) => void) => void;
}

export function FilePreviewPanel({
  activeFile,
  workspaceUuid,
  allFolders,
  query,
  retrievalResults,
  activeRetrievalChunkId,
  selectFile,
  openFileById,
  openRenameFileDialog,
  deleteSelectionItems,
  moveFile,
  duplicateItem,
  downloadFileDirect,
  copyFileShareLink,
  toggleCurrentPinnedItem,
  isCurrentPinned,
  currentInfoEntries,
  wikiMarkdownFiles,
  startBannerUpload,
  startUpload,
  loadShareSuggestions,
}: FilePreviewPanelProps) {
  const filePreviewScrollRef = useRef<HTMLDivElement | null>(null);
  const [markdownLoading, setMarkdownLoading] = useState(false);
  const [markdownError, setMarkdownError] = useState<string | null>(null);
  const [markdownOriginal, setMarkdownOriginal] = useState("");
  const [markdownDraft, setMarkdownDraft] = useState("");
  const [markdownSaving, setMarkdownSaving] = useState(false);
  const [noteSaveState, setNoteSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [notePage, setNotePage] = useState<PageMetadataState>(
    EMPTY_PAGE_METADATA_STATE
  );
  const [notePageOriginal, setNotePageOriginal] = useState<PageMetadataState>(
    EMPTY_PAGE_METADATA_STATE
  );
  const [noteRemoteUpdatedAt, setNoteRemoteUpdatedAt] = useState<string | null>(
    null
  );
  const [noteBannerUploadBusy, setNoteBannerUploadBusy] = useState(false);
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const [audioLoadFailed, setAudioLoadFailed] = useState(false);
  const [mediaStreamFailed, setMediaStreamFailed] = useState(false);
  const noteBannerInputRef = useRef<HTMLInputElement | null>(null);
  const noteDraftDocRef = useRef<Y.Doc | null>(null);
  const noteDraftTextRef = useRef<Y.Text | null>(null);
  const markdownDraftRef = useRef("");

  const activeFileIsMarkdown = useMemo(
    () => detectPreviewKind(activeFile).isMarkdown,
    [activeFile]
  );
  const activeFileIsNote = Boolean(activeFile.isNote);
  const activeFileSourceUrl = activeFileIsNote
    ? `/api/workspaces/${workspaceUuid}/files/${activeFile.id}/stream`
    : activeFile.storageUrl;
  const activePageFromFile = useMemo(
    () => activeFile.page ?? EMPTY_PAGE_METADATA_STATE,
    [activeFile.page]
  );
  const activeFileUpdatedAt = activeFile.updatedAt ?? null;

  useEffect(() => {
    markdownDraftRef.current = markdownDraft;
  }, [markdownDraft]);

  useEffect(() => {
    if (!(workspaceUuid && activeFileIsNote)) {
      noteDraftDocRef.current = null;
      noteDraftTextRef.current = null;
      return;
    }

    const noteRevision = noteRemoteUpdatedAt ?? activeFileUpdatedAt ?? "unknown";
    const persistenceKey = [
      "avenire",
      "note-draft",
      workspaceUuid,
      activeFile.id,
      noteRevision,
    ].join(":");

    const doc = new Y.Doc();
    const text = doc.getText("markdown");
    const persistence = new IndexeddbPersistence(persistenceKey, doc);
    noteDraftDocRef.current = doc;
    noteDraftTextRef.current = text;

    let cancelled = false;
    const applyText = () => {
      if (cancelled) {
        return;
      }
      const nextDraft = text.toString();
      if (nextDraft === markdownDraftRef.current) {
        return;
      }
      setMarkdownDraft(nextDraft);
    };

    const initialize = () => {
      if (cancelled) {
        return;
      }
      const persistedDraft = text.toString();
      if (persistedDraft.length > 0) {
        if (persistedDraft !== markdownDraftRef.current) {
          setMarkdownDraft(persistedDraft);
        }
        return;
      }
      if (markdownDraftRef.current.length > 0) {
        text.insert(0, markdownDraftRef.current);
      }
    };

    text.observe(applyText);
    void persistence.whenSynced.then(initialize);

    return () => {
      cancelled = true;
      text.unobserve(applyText);
      persistence.destroy();
      doc.destroy();
      if (noteDraftDocRef.current === doc) {
        noteDraftDocRef.current = null;
      }
      if (noteDraftTextRef.current === text) {
        noteDraftTextRef.current = null;
      }
    };
  }, [
    activeFile.id,
    activeFileIsNote,
    activeFileUpdatedAt,
    noteRemoteUpdatedAt,
    workspaceUuid,
  ]);

  useEffect(() => {
    const text = noteDraftTextRef.current;
    if (!(text && activeFileIsNote)) {
      return;
    }

    const nextDraft = markdownDraft;
    if (text.toString() === nextDraft) {
      return;
    }

    text.delete(0, text.length);
    if (nextDraft.length > 0) {
      text.insert(0, nextDraft);
    }
  }, [activeFileIsNote, markdownDraft]);

  useEffect(() => {
    if (!(workspaceUuid && activeFile && activeFileIsMarkdown)) {
      setMarkdownLoading(false);
      setMarkdownError(null);
      setMarkdownOriginal("");
      setMarkdownDraft("");
      setNotePage(EMPTY_PAGE_METADATA_STATE);
      setNotePageOriginal(EMPTY_PAGE_METADATA_STATE);
      setNoteRemoteUpdatedAt(null);
      return;
    }

    const cached = readWorkspaceMarkdownCache(workspaceUuid, activeFile.id);
    if (cached && cached.updatedAt === activeFileUpdatedAt) {
      setMarkdownLoading(false);
      setMarkdownError(null);
      setMarkdownOriginal(cached.body);
      setMarkdownDraft(activeFileIsNote ? cached.body : cached.content);
      setNotePage(cached.page);
      setNotePageOriginal(cached.page);
      setNoteRemoteUpdatedAt(cached.updatedAt ?? activeFileUpdatedAt);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setMarkdownLoading(true);
    setMarkdownError(null);

    fetch(`/api/workspaces/${workspaceUuid}/files/${activeFile.id}/stream`, {
      signal: controller.signal,
      headers: {
        Accept: "text/markdown,text/plain,*/*",
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unable to load markdown (${response.status})`);
        }
        const text = await response.text();
        if (cancelled) {
          return;
        }
        const resolved = resolvePageDocument({
          content: text,
          page: activePageFromFile,
        });
        if (activeFileIsNote) {
          setMarkdownOriginal(text);
          setMarkdownDraft(resolved.body);
          setNotePageOriginal(activePageFromFile);
          setNotePage(resolved.page);
          setNoteRemoteUpdatedAt(activeFileUpdatedAt);
          writeWorkspaceMarkdownCache(workspaceUuid, activeFile.id, {
            body: resolved.body,
            content: text,
            page: resolved.page,
            updatedAt: activeFileUpdatedAt,
          });
        } else {
          const parsed = splitFrontmatterDocument(text);
          const composite = updateContentWithFrontmatter(
            parsed.body,
            parsed.properties
          );
          setMarkdownOriginal(parsed.body);
          setMarkdownDraft(composite);
          setNoteRemoteUpdatedAt(activeFileUpdatedAt);
          writeWorkspaceMarkdownCache(workspaceUuid, activeFile.id, {
            body: parsed.body,
            content: text,
            page: EMPTY_PAGE_METADATA_STATE,
            updatedAt: activeFileUpdatedAt,
          });
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if ((error as { name?: string })?.name === "AbortError") {
          return;
        }
        setMarkdownError(
          error instanceof Error ? error.message : "Unable to load markdown."
        );
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setMarkdownLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeFile,
    activeFileIsMarkdown,
    activeFileIsNote,
    activeFileUpdatedAt,
    activePageFromFile,
    workspaceUuid,
  ]);

  const markdownDocument = useMemo(
    () => splitFrontmatterDocument(markdownDraft),
    [markdownDraft]
  );
  const markdownBody = activeFileIsNote ? markdownDraft : markdownDocument.body;
  const markdownDirty = markdownBody !== markdownOriginal;
  const notePageDirty = useMemo(
    () => !arePageMetadataStatesEqual(notePage, notePageOriginal),
    [notePage, notePageOriginal]
  );

  const handleMarkdownBodyChange = useCallback((nextBody: string) => {
    if (activeFileIsNote) {
      setMarkdownDraft(nextBody);
      return;
    }
    setMarkdownDraft((current) => {
      const { properties } = splitFrontmatterDocument(current);
      return updateContentWithFrontmatter(nextBody, properties);
    });
  }, [activeFileIsNote]);

  const saveMarkdown = useCallback(async () => {
    if (!(workspaceUuid && activeFile && activeFileIsMarkdown)) {
      return;
    }
    if (activeFile.readOnly) {
      return;
    }
    if (!markdownDirty) {
      return;
    }

    setMarkdownSaving(true);
    try {
      const blob = new Blob([markdownDraft], { type: "text/markdown" });
      const file = new File([blob], activeFile.name, { type: "text/markdown" });
      const uploaded = ((await startUpload([file])) ?? [])[0] as
        | {
            key?: string;
            ufsUrl?: string;
            url?: string;
            size?: number;
            contentType?: string;
          }
        | undefined;
      const storageKey = uploaded?.key;
      const storageUrl = uploaded?.ufsUrl ?? uploaded?.url;
      if (!(storageKey && storageUrl)) {
        throw new Error("Upload returned no file metadata");
      }

      const response = await fetch(
        `/api/workspaces/${workspaceUuid}/files/${activeFile.id}/content`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storageKey,
            storageUrl,
            sizeBytes: blob.size,
            mimeType: "text/markdown",
          }),
        }
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Unable to save markdown.");
      }

      setMarkdownOriginal(markdownBody);
      writeWorkspaceMarkdownCache(workspaceUuid, activeFile.id, {
        body: markdownBody,
        content: markdownDraft,
        page: EMPTY_PAGE_METADATA_STATE,
        updatedAt: activeFileUpdatedAt,
      });
    } catch (error) {
      setMarkdownError(
        error instanceof Error ? error.message : "Unable to save markdown."
      );
    } finally {
      setMarkdownSaving(false);
    }
  }, [
    activeFile,
    activeFileIsMarkdown,
    markdownDirty,
    markdownBody,
    startUpload,
    workspaceUuid,
  ]);

  const saveNoteDraft = useCallback(
    async (draft: string, page: PageMetadataState) => {
      if (!(activeFile && activeFileIsMarkdown && activeFileIsNote)) {
        return;
      }
      if (activeFile.readOnly) {
        return;
      }

      setNoteSaveState("saving");
      try {
        const response = await fetch(`/api/notes/${activeFile.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: draft,
            page,
            updatedAt: noteRemoteUpdatedAt ?? activeFileUpdatedAt,
          }),
        });

        if (response.status === 409) {
          const payload = (await response.json().catch(() => ({}))) as {
            content?: string;
            error?: string;
            page?: PageMetadataState | null;
            updatedAt?: string | null;
          };
          const remoteBody = typeof payload.content === "string" ? payload.content : draft;
          const remotePage = normalizePageMetadataState(
            payload.page ?? EMPTY_PAGE_METADATA_STATE
          );
          setMarkdownOriginal(remoteBody);
          setMarkdownDraft(remoteBody);
          setNotePageOriginal(remotePage);
          setNotePage(remotePage);
          setNoteRemoteUpdatedAt(payload.updatedAt ?? null);
          writeWorkspaceMarkdownCache(workspaceUuid, activeFile.id, {
            body: remoteBody,
            content: remoteBody,
            page: remotePage,
            updatedAt: payload.updatedAt ?? null,
          });
          setNoteSaveState("error");
          return;
        }

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error ?? "Unable to save note.");
        }

        const payload = (await response.json().catch(() => ({}))) as {
          page?: PageMetadataState | null;
          updatedAt?: string | null;
        };

        setMarkdownOriginal(draft);
        setNotePageOriginal(page);
        setNoteRemoteUpdatedAt(payload.updatedAt ?? noteRemoteUpdatedAt ?? null);
        writeWorkspaceMarkdownCache(workspaceUuid, activeFile.id, {
          body: draft,
          content: draft,
          page,
          updatedAt: payload.updatedAt ?? noteRemoteUpdatedAt ?? null,
        });
        setNoteSaveState("saved");
      } catch {
        setNoteSaveState("error");
      }
    },
    [
      activeFile,
      activeFileIsMarkdown,
      activeFileIsNote,
      activeFileUpdatedAt,
      noteRemoteUpdatedAt,
      workspaceUuid,
    ]
  );

  const noteSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!(activeFileIsMarkdown && activeFileIsNote) || activeFile.readOnly) {
      setNoteSaveState("idle");
      return;
    }

    if (!(markdownDirty || notePageDirty)) {
      return;
    }

    if (noteSaveTimerRef.current) {
      window.clearTimeout(noteSaveTimerRef.current);
    }

    noteSaveTimerRef.current = window.setTimeout(() => {
      void saveNoteDraft(markdownBody, notePage);
    }, 2000);

    return () => {
      if (noteSaveTimerRef.current) {
        window.clearTimeout(noteSaveTimerRef.current);
      }
    };
  }, [
    activeFile.readOnly,
    activeFileIsMarkdown,
    activeFileIsNote,
    markdownDirty,
    markdownBody,
    notePage,
    notePageDirty,
    saveNoteDraft,
  ]);

  useEffect(() => {
    setNoteSaveState("idle");
    setNotePage(EMPTY_PAGE_METADATA_STATE);
    setNotePageOriginal(EMPTY_PAGE_METADATA_STATE);
    setNoteRemoteUpdatedAt(null);
  }, [activeFile.id]);

  useEffect(() => {
    if (noteSaveState !== "saved" && noteSaveState !== "error") {
      return;
    }

    const delay = noteSaveState === "saved" ? 1500 : 4000;
    const timer = window.setTimeout(() => {
      setNoteSaveState("idle");
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [noteSaveState]);

  const noteBannerUrl =
    notePage.bannerUrl?.trim() && notePage.bannerUrl.trim().length > 0
      ? notePage.bannerUrl.trim()
      : null;

  const triggerNoteBannerPicker = useCallback(() => {
    if (!activeFileIsNote || activeFile.readOnly || noteBannerUploadBusy) {
      return;
    }
    noteBannerInputRef.current?.click();
  }, [activeFile.readOnly, activeFileIsNote, noteBannerUploadBusy]);

  const handleNoteBannerInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.currentTarget.value = "";

      if (!(file && activeFileIsNote) || activeFile.readOnly) {
        return;
      }

      setNoteBannerUploadBusy(true);
      try {
        const uploaded = ((await startBannerUpload([file])) ?? [])[0] as
          | {
              ufsUrl?: string;
              url?: string;
            }
          | undefined;
        const uploadedUrl =
          (typeof uploaded?.ufsUrl === "string" && uploaded.ufsUrl) ||
          (typeof uploaded?.url === "string" && uploaded.url) ||
          null;

        if (!uploadedUrl) {
          throw new Error("Upload returned no file metadata");
        }

        setNotePage((current) => ({
          ...current,
          bannerUrl: uploadedUrl,
        }));
      } catch (error) {
        setMarkdownError(
          error instanceof Error ? error.message : "Unable to upload banner."
        );
      } finally {
        setNoteBannerUploadBusy(false);
      }
    },
    [activeFile.readOnly, activeFileIsNote, startBannerUpload]
  );

  const activeMediaStreamUrl = useMemo(() => {
    if (!(activeFile && workspaceUuid)) {
      return null;
    }
    return `/api/workspaces/${workspaceUuid}/files/${activeFile.id}/stream`;
  }, [activeFile, workspaceUuid]);
  const activeMediaSrc = useMemo(() => {
    if (!activeMediaStreamUrl) {
      return null;
    }
    return activeMediaStreamUrl;
  }, [activeMediaStreamUrl]);
  const activePlaybackDescriptor = useMemo(() => {
    if (!(activeFile && activeMediaSrc)) {
      return null;
    }
    return buildVideoPlaybackDescriptor({
      fallbackUrl: activeMediaSrc,
      mimeType: activeFile.mimeType,
      videoDelivery: mediaStreamFailed ? null : activeFile.videoDelivery,
    });
  }, [activeFile, activeMediaSrc, mediaStreamFailed]);
  const activeVideoCaptionsSrc = useMemo(() => {
    if (!(activeFile && workspaceUuid)) {
      return undefined;
    }
    const isVideo = (activeFile.mimeType ?? "")
      .toLowerCase()
      .startsWith("video/");
    if (!isVideo) {
      return undefined;
    }
    return `/api/workspaces/${workspaceUuid}/files/${activeFile.id}/captions.vtt`;
  }, [activeFile, workspaceUuid]);

  const activeFileRetrievalResults = useMemo(() => {
    return retrievalResults.filter(
      (result) => (result.fileId ?? result.id) === activeFile.id
    );
  }, [activeFile, retrievalResults]);
  const activeRetrievalResult = useMemo(() => {
    if (activeFileRetrievalResults.length === 0) {
      return null;
    }
    if (activeRetrievalChunkId) {
      return (
        activeFileRetrievalResults.find(
          (result) => result.chunkId === activeRetrievalChunkId
        ) ?? activeFileRetrievalResults[0]
      );
    }
    return activeFileRetrievalResults[0] ?? null;
  }, [activeFileRetrievalResults, activeRetrievalChunkId]);

  useEffect(() => {
    setVideoLoadFailed(false);
    setAudioLoadFailed(false);
    setMediaStreamFailed(false);
  }, [activeFile.id]);

  useEffect(() => {
    markFileOpened(activeFile.id);
    const { isAudio, isVideo } = detectPreviewKind(activeFile);
    if (!(isAudio || isVideo)) {
      return;
    }

    const playbackSource = isVideo
      ? (activePlaybackDescriptor?.preferredSource ?? null)
      : activeMediaSrc
        ? buildProgressivePlaybackSource(activeMediaSrc, activeFile.mimeType)
        : null;
    if (!playbackSource) {
      return;
    }

    void primeMediaPlayback(playbackSource, {
      mediaType: isVideo ? "video" : "audio",
      posterUrl: isVideo ? activePlaybackDescriptor?.posterUrl : null,
      sizeBytes: activeFile.sizeBytes,
      surface: "viewer",
    });
    return () => {
      releaseMediaPlaybackPrime(playbackSource);
    };
  }, [activeFile, activeMediaSrc, activePlaybackDescriptor]);

  const { isAudio, isImage, isPdf, isVideo, isMarkdown } =
    detectPreviewKind(activeFile);
  const isOpenedCached = isFileOpenedCached(activeFile.id);
  const activeAudioPlaybackSource = buildProgressivePlaybackSource(
    activeMediaSrc ?? activeFile.storageUrl,
    activeFile.mimeType
  );
  const isPreferredVideoSourceWarm = activePlaybackDescriptor
    ? getWarmState(activePlaybackDescriptor.preferredSource) === "warm"
    : false;
  const shouldUsePreferredVideoSource =
    isOpenedCached || isPreferredVideoSourceWarm;
  const activeVideoPlaybackSource = activePlaybackDescriptor
    ? activePlaybackDescriptor.preferredSource
    : buildProgressivePlaybackSource(
        activeMediaSrc ?? activeFile.storageUrl,
        activeFile.mimeType
      );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-12 items-center justify-between gap-2 border-border/70 border-b bg-card/40 px-3">
        <div className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs">
          <Button
            className="size-5"
            onClick={() => selectFile(null)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ArrowLeft className="size-3" />
          </Button>
          <span className="truncate text-foreground">{activeFile.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="hidden text-muted-foreground text-xs sm:inline">
            Edited {toUpdatedLabel(activeFile.updatedAt ?? activeFile.createdAt)}{" "}
            ago
          </span>
          {isMarkdown && !activeFile.readOnly && !activeFile.isNote ? (
            <Button
              className="h-7"
              disabled={markdownSaving || !markdownDirty}
              onClick={() => {
                void saveMarkdown();
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              {markdownSaving ? "Saving..." : "Save"}
            </Button>
          ) : null}
          {activeFile.readOnly ? null : (
            <ShareDialog
              variant="file"
              workspaceUuid={workspaceUuid}
              activeFile={activeFile}
              loadShareSuggestions={loadShareSuggestions}
            />
          )}
          <Button
            className="size-5"
            onClick={toggleCurrentPinnedItem}
            size="icon-xs"
            type="button"
            variant={isCurrentPinned ? "secondary" : "ghost"}
          >
            {isCurrentPinned ? (
              <PinOff className="size-3" />
            ) : (
              <Pin className="size-3" />
            )}
          </Button>
          <Button
            className="size-5"
            onClick={() =>
              window.open(
                activeFileSourceUrl,
                "_blank",
                "noopener,noreferrer"
              )
            }
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ArrowUp className="size-3" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  className="size-5"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                />
              }
            >
              <MoreHorizontal className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={toggleCurrentPinnedItem}>
                {isCurrentPinned ? (
                  <PinOff className="size-3.5" />
                ) : (
                  <Pin className="size-3.5" />
                )}
                {isCurrentPinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  openRenameFileDialog(activeFile);
                }}
              >
                <Pencil className="size-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void duplicateItem({
                    id: activeFile.id,
                    kind: "file",
                    parentId: activeFile.folderId,
                  });
                }}
              >
                <Copy className="size-3.5" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void copyFileShareLink(activeFile);
                }}
              >
                <Share2 className="size-3.5" />
                Share
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput className="size-3.5" />
                  Move To
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {allFolders
                    .filter((folder) => !folder.readOnly)
                    .slice(0, 20)
                    .map((folder) => (
                      <DropdownMenuItem
                        key={folder.id}
                        onClick={() => {
                          void moveFile(activeFile.id, folder.id);
                        }}
                      >
                        {folder.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onClick={() => {
                  downloadFileDirect(activeFile);
                }}
              >
                <ArrowDownToLine className="size-3.5" />
                Download
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Info className="size-3.5" />
                  Information
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-72">
                  {currentInfoEntries.map((entry) => (
                    <div
                      className="flex items-start justify-between gap-3 px-2 py-1.5 text-xs"
                      key={entry.label}
                    >
                      <span className="text-muted-foreground">
                        {entry.label}
                      </span>
                      <span className="max-w-[12rem] text-right text-foreground">
                        {entry.value}
                      </span>
                    </div>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  void deleteSelectionItems([{ id: activeFile.id, kind: "file" }]);
                }}
                variant="destructive"
              >
                <Trash2 className="size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto bg-muted/25"
        ref={filePreviewScrollRef}
      >
        {isMarkdown ? (
          <div className="h-full">
            {markdownLoading ? (
              <div className="mx-auto flex h-[70vh] max-w-[820px] items-center justify-center p-4 text-muted-foreground text-sm">
                Loading markdown...
              </div>
            ) : markdownError ? (
              <div className="mx-auto flex h-[70vh] max-w-[820px] flex-col items-center justify-center gap-3 p-4 text-center">
                <FileText className="size-8 text-muted-foreground" />
                <p className="text-muted-foreground text-xs">{markdownError}</p>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                {activeFileIsNote ? (
                  <div className="border-border/50 border-b bg-background">
                    <div className="group relative mx-auto w-full max-w-[50rem] overflow-hidden rounded-b-[2rem] border-x border-b border-border/60 bg-muted/30">
                      {noteBannerUrl ? (
                        <img
                          alt={`${activeFile.name} banner`}
                          className="h-40 w-full object-cover"
                          loading="lazy"
                          src={noteBannerUrl}
                        />
                      ) : (
                        <div className="h-40 w-full bg-[#d8d1c5]" />
                      )}
                      <div className="absolute inset-0 bg-black/5" />
                      <div className="absolute right-4 bottom-4 flex items-center gap-2">
                        <Button
                          className="h-8 rounded-full bg-background/92 px-3 text-xs shadow-sm backdrop-blur"
                          disabled={activeFile.readOnly || noteBannerUploadBusy}
                          onClick={triggerNoteBannerPicker}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          <FileImage className="mr-1 size-3.5" />
                          {noteBannerUploadBusy ? "Uploading..." : "Change banner"}
                        </Button>
                        <Button
                          className="h-8 rounded-full bg-background/92 px-3 text-xs shadow-sm backdrop-blur"
                          disabled={
                            activeFile.readOnly ||
                            noteBannerUploadBusy ||
                            !noteBannerUrl
                          }
                          onClick={() => {
                            setNotePage((current) => ({
                              ...current,
                              bannerUrl: null,
                            }));
                          }}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          <XCircle className="mr-1 size-3.5" />
                          Reset banner
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
                <PropertiesTable
                  onChange={(properties) => {
                    if (activeFileIsNote) {
                      setNotePage((current) => ({
                        ...current,
                        properties,
                      }));
                      return;
                    }
                    setMarkdownDraft((current) =>
                      updateContentWithFrontmatter(markdownBody, properties)
                    );
                  }}
                  properties={
                    activeFileIsNote ? notePage.properties : markdownDocument.properties
                  }
                />
                <AvenireEditor
                  defaultValue={markdownBody}
                  key={activeFile.id}
                  onChange={handleMarkdownBodyChange}
                  onOpenWikiLink={(page) => {
                    openFileById(page.id);
                  }}
                  saveState={activeFile.isNote ? noteSaveState : undefined}
                  scrollContainerRef={filePreviewScrollRef}
                  workspaceUuid={workspaceUuid}
                  wikiPages={wikiMarkdownFiles}
                />
                {activeFileIsNote ? (
                  <input
                    accept="image/*"
                    className="hidden"
                    onChange={handleNoteBannerInputChange}
                    ref={noteBannerInputRef}
                    type="file"
                  />
                ) : null}
              </div>
            )}
          </div>
        ) : isPdf ? (
          <div className="h-full p-3">
            <PDFViewer
              className="h-[calc(100svh-7.5rem)] max-h-none rounded-xl border border-border/70"
              fallbackHighlightText={query}
              highlightPage={activeRetrievalResult?.page ?? null}
              highlightText={
                activeRetrievalResult?.highlightText ??
                activeRetrievalResult?.snippet ??
                query
              }
              source={activeFile.storageUrl}
            />
          </div>
        ) : isVideo && !videoLoadFailed ? (
          <div className="mx-auto flex h-full max-w-[1200px] items-center justify-center p-4">
            <FileMediaPlayer
              activeRangeIndex={
                activeFileRetrievalResults.findIndex(
                  (item) => item.chunkId === activeRetrievalChunkId
                ) >= 0
                  ? activeFileRetrievalResults.findIndex(
                      (item) => item.chunkId === activeRetrievalChunkId
                    )
                  : null
              }
              captionsSrc={activeVideoCaptionsSrc}
              kind="video"
              name={activeFile.name}
              onError={() => {
                setVideoLoadFailed(true);
              }}
              openedCached={shouldUsePreferredVideoSource}
              playbackSource={activeVideoPlaybackSource}
              posterUrl={activePlaybackDescriptor?.posterUrl}
              retrievalRanges={activeFileRetrievalResults
                .filter(
                  (item) =>
                    typeof item.startMs === "number" &&
                    Number.isFinite(item.startMs)
                )
                .map((item) => ({
                  startMs: item.startMs as number,
                  endMs: item.endMs,
                }))}
              seekToMs={activeRetrievalResult?.startMs ?? null}
            />
          </div>
        ) : isAudio && !audioLoadFailed ? (
          <div className="mx-auto flex h-full max-w-[900px] items-center justify-center p-4">
            <FileMediaPlayer
              kind="audio"
              name={activeFile.name}
              onError={() => {
                setAudioLoadFailed(true);
              }}
              openedCached={
                isOpenedCached ||
                getWarmState(activeAudioPlaybackSource) === "warm"
              }
              playbackSource={activeAudioPlaybackSource}
            />
          </div>
        ) : isImage ? (
          <div className="mx-auto flex h-full max-w-[1200px] flex-col gap-3 p-4">
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-border/70 bg-white p-4">
              <img
                alt={activeFile.name}
                className="h-auto max-h-full max-w-full rounded-md object-contain"
                src={activeFile.storageUrl}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[55vh] flex-col items-center justify-center gap-3 rounded-md border border-border/70 bg-card p-4 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <p className="text-muted-foreground text-xs">
              In-app preview is unavailable for this file type.
            </p>
            <Button
              onClick={() =>
                window.open(
                  activeFile.storageUrl,
                  "_blank",
                  "noopener,noreferrer"
                )
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Open in new tab
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
