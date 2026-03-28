"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "@avenire/ai/message-types";
import { Button } from "@avenire/ui/components/button";
import {
  Command, CommandEmpty, CommandItem, CommandList, } from "@avenire/ui/components/command";
import { Textarea } from "@avenire/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpIcon, FileText as FileTextIcon, Paperclip as PaperclipIcon, SpinnerGap as Loader2 } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import {
  type Attachment,
  createLocalAttachment,
  createWorkspaceAttachment,
  revokeAttachmentUrl,
} from "@/components/chat/attachment";
import { PreviewAttachment } from "@/components/chat/preview-attachment";
import { useIsMobile } from "@/hooks/use-mobile";
import { getUploadErrorMessage } from "@/lib/upload";
import { useUploadThing } from "@/lib/uploadthing";
import { cn } from "@/lib/utils";

type InputErrorType = "UPLOAD_ERROR" | "MODEL_BUSY" | "UNKNOWN_ERROR";

const ERROR_MESSAGES: Record<InputErrorType, string> = {
  UPLOAD_ERROR:
    "Unable to upload your file. Please try again or choose a different file.",
  MODEL_BUSY:
    "Please wait for the current response to complete before sending a new message.",
  UNKNOWN_ERROR:
    "Something went wrong. Please try again or contact support if the issue persists.",
};

const MAX_MENTION_RESULTS = 20;
const WHITESPACE_REGEX = /\s/;

function readPreferredWorkspaceId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem("preferredWorkspaceId");
}

interface WorkspaceTreeFolder {
  id: string;
  name: string;
  parentId: string | null;
}

interface WorkspaceTreeFile {
  folderId: string;
  id: string;
  mimeType?: string | null;
  name: string;
  sizeBytes?: number;
  storageUrl: string;
}

interface MentionableWorkspaceFile {
  contentType: string;
  id: string;
  name: string;
  nameLower: string;
  parentPath: string;
  pathLower: string;
  sizeBytes?: number;
  url: string;
  workspacePath: string;
}

interface MentionTrigger {
  query: string;
  rangeEnd: number;
  rangeStart: number;
}

function buildWorkspaceFileIndex(input: {
  files: WorkspaceTreeFile[];
  folders: WorkspaceTreeFolder[];
}): MentionableWorkspaceFile[] {
  const folderById = new Map(
    input.folders.map((folder) => [folder.id, folder])
  );
  const folderPathCache = new Map<string, string>();

  const resolveFolderPath = (folderId: string | null): string => {
    if (!folderId) {
      return "";
    }
    const cached = folderPathCache.get(folderId);
    if (cached !== undefined) {
      return cached;
    }

    const segments: string[] = [];
    const seen = new Set<string>();
    let cursor: string | null = folderId;
    while (cursor) {
      if (seen.has(cursor)) {
        break;
      }
      seen.add(cursor);
      const folder = folderById.get(cursor);
      if (!folder) {
        break;
      }
      if (folder.parentId === null) {
        break;
      }
      segments.push(folder.name);
      cursor = folder.parentId;
    }

    const resolved = segments.reverse().join("/");
    folderPathCache.set(folderId, resolved);
    return resolved;
  };

  const indexedFiles: MentionableWorkspaceFile[] = [];
  for (const file of input.files) {
    if (!(file.id && file.name && file.storageUrl)) {
      continue;
    }
    const parentPath = resolveFolderPath(file.folderId);
    const workspacePath = parentPath ? `${parentPath}/${file.name}` : file.name;
    indexedFiles.push({
      id: file.id,
      name: file.name,
      contentType: file.mimeType || "application/octet-stream",
      parentPath,
      pathLower: workspacePath.toLowerCase(),
      nameLower: file.name.toLowerCase(),
      sizeBytes: file.sizeBytes,
      url: file.storageUrl,
      workspacePath,
    });
  }

  return indexedFiles.sort((a, b) =>
    a.workspacePath.localeCompare(b.workspacePath, undefined, {
      sensitivity: "base",
    })
  );
}

async function loadWorkspaceMentionFiles(input: {
  signal: AbortSignal;
  workspaceUuid: string;
}): Promise<MentionableWorkspaceFile[]> {
  const response = await fetch(`/api/workspaces/${input.workspaceUuid}/tree`, {
    cache: "no-store",
    signal: input.signal,
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    files?: WorkspaceTreeFile[];
    folders?: WorkspaceTreeFolder[];
  };
  return buildWorkspaceFileIndex({
    files: payload.files ?? [],
    folders: payload.folders ?? [],
  });
}

function getMentionTrigger(
  text: string,
  selectionStart: number,
  selectionEnd: number
): MentionTrigger | null {
  if (selectionStart !== selectionEnd) {
    return null;
  }

  let rangeStart = selectionStart;
  while (rangeStart > 0 && !WHITESPACE_REGEX.test(text[rangeStart - 1] ?? "")) {
    rangeStart -= 1;
  }

  if (text[rangeStart] !== "@") {
    return null;
  }

  let rangeEnd = selectionStart;
  while (
    rangeEnd < text.length &&
    !WHITESPACE_REGEX.test(text[rangeEnd] ?? "")
  ) {
    rangeEnd += 1;
  }

  return {
    rangeStart,
    rangeEnd,
    query: text.slice(rangeStart + 1, selectionStart),
  };
}

function PureMultimodalInput({
  input,
  setInput,
  status,
  attachments,
  setAttachments,
  handleSubmit,
  workspaceUuid,
  className,
  centered = false,
}: {
  input: string;
  setInput: (input: string) => void;
  status: UseChatHelpers<UIMessage>["status"];
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  handleSubmit: (
    inputValue: string,
    files: Attachment[]
  ) => void | Promise<void>;
  workspaceUuid: string;
  className?: string;
  centered?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionItemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const latestInputRef = useRef(input);
  const hasHydratedInputRef = useRef(false);
  const uploadingIdsRef = useRef(new Set<string>());
  const [textareaSelection, setTextareaSelection] = useState({
    start: 0,
    end: 0,
  });
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const [dismissedMentionKey, setDismissedMentionKey] = useState<string | null>(
    null
  );
  const { width } = useWindowSize();
  const isMobile = useIsMobile();
  const MAX_FILES = 3;
  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "chat-input",
    ""
  );
  const [preferredWorkspaceId] = useLocalStorage<string | null>(
    "preferredWorkspaceId",
    null
  );
  const effectiveWorkspaceUuid =
    preferredWorkspaceId?.trim() ||
    readPreferredWorkspaceId()?.trim() ||
    workspaceUuid;

  const { startUpload } = useUploadThing("chatAttachmentUploader", {
    onUploadError: () => {
      toast.error(ERROR_MESSAGES.UPLOAD_ERROR);
    },
  });

  const uploadQueue = useMemo(
    () =>
      attachments.filter(
        (attachment) =>
          attachment.status === "pending" || attachment.status === "uploading"
      ),
    [attachments]
  );

  const completedAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.status === "completed"),
    [attachments]
  );

  const canSend = useMemo(
    () =>
      (input.trim().length > 0 || completedAttachments.length > 0) &&
      uploadQueue.length === 0,
    [completedAttachments.length, input, uploadQueue.length]
  );

  const mentionTrigger = useMemo(
    () =>
      getMentionTrigger(input, textareaSelection.start, textareaSelection.end),
    [input, textareaSelection.end, textareaSelection.start]
  );

  const workspaceFilesQuery = useQuery({
    enabled: Boolean(effectiveWorkspaceUuid),
    queryFn: ({ signal }) =>
      effectiveWorkspaceUuid
        ? loadWorkspaceMentionFiles({
            signal,
            workspaceUuid: effectiveWorkspaceUuid,
          })
        : Promise.resolve([]),
    queryKey: ["workspace-mention-files", effectiveWorkspaceUuid],
    staleTime: 30_000,
  });

  const workspaceFiles = workspaceFilesQuery.data ?? [];
  const workspaceFilesLoaded =
    !effectiveWorkspaceUuid || workspaceFilesQuery.isFetched;

  const mentionSuggestions = useMemo(() => {
    if (!mentionTrigger) {
      return [];
    }

    const query = mentionTrigger.query.trim().toLowerCase();
    const ranked = workspaceFiles
      .flatMap((file) => {
        if (!query) {
          return [{ file, rank: 4 }];
        }

        const nameStartsWith = file.nameLower.startsWith(query);
        const pathStartsWith = file.pathLower.startsWith(query);
        const nameIncludes = file.nameLower.includes(query);
        const pathIncludes = file.pathLower.includes(query);

        if (
          !(nameStartsWith || pathStartsWith || nameIncludes || pathIncludes)
        ) {
          return [];
        }

        let rank = 3;
        if (nameStartsWith) {
          rank = 0;
        } else if (pathStartsWith) {
          rank = 1;
        } else if (nameIncludes) {
          rank = 2;
        }

        return [{ file, rank }];
      })
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          a.file.workspacePath.localeCompare(b.file.workspacePath, undefined, {
            sensitivity: "base",
          })
      );

    return ranked.slice(0, MAX_MENTION_RESULTS).map((entry) => entry.file);
  }, [mentionTrigger, workspaceFiles]);

  const mentionTriggerKey = mentionTrigger
    ? `${mentionTrigger.rangeStart}:${mentionTrigger.rangeEnd}:${mentionTrigger.query}`
    : null;
  const isMentionMenuOpen =
    mentionTriggerKey !== null &&
    workspaceFilesLoaded &&
    dismissedMentionKey !== mentionTriggerKey;

  const updateTextareaSelection = useCallback(
    (start?: number, end?: number) => {
      if (
        typeof start === "number" &&
        typeof end === "number" &&
        Number.isFinite(start) &&
        Number.isFinite(end)
      ) {
        setTextareaSelection({ start, end });
        return;
      }

      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      setTextareaSelection({
        start: textarea.selectionStart ?? 0,
        end: textarea.selectionEnd ?? 0,
      });
    },
    []
  );

  useEffect(() => {
    latestInputRef.current = input;
    if (!textareaRef.current) {
      return;
    }
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
  }, [input]);

  useEffect(() => {
    if (hasHydratedInputRef.current) {
      return;
    }
    hasHydratedInputRef.current = true;
    if (!localStorageInput) {
      return;
    }
    setInput(localStorageInput);
  }, [localStorageInput, setInput]);

  useEffect(() => {
    if (!mentionTriggerKey) {
      setDismissedMentionKey(null);
    }
  }, [mentionTriggerKey]);

  useEffect(() => {
    if (!isMentionMenuOpen) {
      setHighlightedMentionIndex(0);
      mentionItemRefs.current = [];
      return;
    }

    setHighlightedMentionIndex((previous) => {
      if (mentionSuggestions.length === 0) {
        return 0;
      }
      return Math.min(previous, mentionSuggestions.length - 1);
    });
  }, [isMentionMenuOpen, mentionSuggestions.length]);

  useEffect(() => {
    if (!isMentionMenuOpen || mentionSuggestions.length === 0) {
      return;
    }

    const activeItem = mentionItemRefs.current[highlightedMentionIndex];
    if (!activeItem) {
      return;
    }

    activeItem.scrollIntoView({
      block: "nearest",
    });
  }, [highlightedMentionIndex, isMentionMenuOpen, mentionSuggestions.length]);

  const updateAttachment = useCallback(
    (id: string, update: Partial<Attachment>) => {
      setAttachments((prev) =>
        prev.map((attachment) =>
          attachment.id === id ? { ...attachment, ...update } : attachment
        )
      );
    },
    [setAttachments]
  );

  const uploadAttachment = useCallback(
    async (attachment: Attachment) => {
      if (!attachment.file) {
        return;
      }

      try {
        updateAttachment(attachment.id, {
          status: "uploading",
          errorMessage: undefined,
        });

        const uploadedFiles = await startUpload([attachment.file]);
        const uploaded = uploadedFiles?.[0];

        if (!uploaded) {
          throw new Error("Missing uploaded file metadata");
        }

        const uploadedUrl = "ufsUrl" in uploaded ? uploaded.ufsUrl : undefined;

        if (!uploadedUrl) {
          throw new Error("Upload returned no URL");
        }

        revokeAttachmentUrl(attachment.url);

        updateAttachment(attachment.id, {
          status: "completed",
          url: uploadedUrl,
          storageKey: "key" in uploaded ? uploaded.key : undefined,
        });
      } catch (error) {
        const errorMessage = getUploadErrorMessage(error);
        updateAttachment(attachment.id, {
          status: "failed",
          errorMessage,
        });
      }
    },
    [startUpload, updateAttachment]
  );

  useEffect(() => {
    const pending = attachments.filter(
      (attachment) =>
        attachment.status === "pending" &&
        Boolean(attachment.file) &&
        !uploadingIdsRef.current.has(attachment.id)
    );

    if (pending.length === 0) {
      return;
    }

    for (const attachment of pending) {
      uploadingIdsRef.current.add(attachment.id);
    }

    const processPendingUploads = async () => {
      for (const attachment of pending) {
        await uploadAttachment(attachment);
        uploadingIdsRef.current.delete(attachment.id);
      }
    };
    processPendingUploads().catch(() => undefined);
  }, [attachments, uploadAttachment]);

  const enqueueFiles = useCallback(
    (incomingFiles: File[]) => {
      if (incomingFiles.length === 0) {
        return;
      }

      if (attachments.length + incomingFiles.length > MAX_FILES) {
        toast.error("File limit exceeded", {
          description: `You can only upload up to ${MAX_FILES} files per message.`,
          duration: 3000,
        });
        return;
      }

      const nextAttachments = incomingFiles.map(createLocalAttachment);
      setAttachments((prev) => [...prev, ...nextAttachments]);
    },
    [attachments.length, setAttachments]
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    enqueueFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      setAttachments((prev) => {
        const selected = prev.find(
          (attachment) => attachment.id === attachmentId
        );
        if (!selected) {
          return prev;
        }
        revokeAttachmentUrl(selected.url);
        return prev.filter((attachment) => attachment.id !== attachmentId);
      });
    },
    [setAttachments]
  );

  const selectMention = useCallback(
    (file: MentionableWorkspaceFile) => {
      if (!mentionTrigger) {
        return;
      }
      if (!file.url || file.url.trim().length === 0) {
        toast.error("This file cannot be attached right now.");
        return;
      }

      const replacement = `@${file.workspacePath} `;
      const nextInput = `${input.slice(0, mentionTrigger.rangeStart)}${replacement}${input.slice(mentionTrigger.rangeEnd)}`;
      const nextCursor = mentionTrigger.rangeStart + replacement.length;

      latestInputRef.current = nextInput;
      setInput(nextInput);
      setDismissedMentionKey(null);

      setAttachments((previous) => {
        if (
          previous.some((attachment) => attachment.workspaceFileId === file.id)
        ) {
          return previous;
        }
        if (previous.length >= MAX_FILES) {
          toast.error("File limit exceeded", {
            description: `You can only upload up to ${MAX_FILES} files per message.`,
            duration: 3000,
          });
          return previous;
        }
        return [
          ...previous,
          createWorkspaceAttachment({
            id: file.id,
            name: file.name,
            url: file.url,
            contentType: file.contentType,
            sizeBytes: file.sizeBytes,
            workspacePath: file.workspacePath,
          }),
        ];
      });

      window.requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
          return;
        }
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
        updateTextareaSelection(nextCursor, nextCursor);
      });
    },
    [
      MAX_FILES,
      input,
      mentionTrigger,
      setAttachments,
      setInput,
      updateTextareaSelection,
    ]
  );

  const resetHeight = () => {
    if (!textareaRef.current) {
      return;
    }
    textareaRef.current.style.height = "98px";
  };

  const submitForm = useCallback(async () => {
    if (status === "submitted" || status === "streaming") {
      toast.error(ERROR_MESSAGES.MODEL_BUSY, {
        description: "The AI is currently processing your previous message.",
        duration: 3000,
      });
      return;
    }

    const hasText = input.trim().length > 0;
    if (!hasText && completedAttachments.length === 0) {
      return;
    }

    const inputValue =
      textareaRef.current?.value ?? latestInputRef.current ?? input;
    const attachmentsToSubmit = completedAttachments;

    setAttachments([]);
    latestInputRef.current = "";
    setInput("");
    setLocalStorageInput("");
    resetHeight();

    if (width && width > 768) {
      textareaRef.current?.focus();
    }

    try {
      await handleSubmit(inputValue, attachmentsToSubmit);
    } catch {
      setInput(inputValue);
      setLocalStorageInput(inputValue);
      setAttachments(attachmentsToSubmit);
      toast.error(ERROR_MESSAGES.UNKNOWN_ERROR);
      return;
    }

    try {
      window.localStorage.removeItem("chat-input");
    } catch {
      // ignore localStorage errors in restricted contexts
    }

    for (const attachment of attachmentsToSubmit) {
      revokeAttachmentUrl(attachment.url);
    }
  }, [
    completedAttachments,
    handleSubmit,
    input,
    setAttachments,
    setInput,
    setLocalStorageInput,
    status,
    width,
  ]);

  const runSubmitForm = useCallback(() => {
    submitForm().catch(() => undefined);
  }, [submitForm]);

  const handleMentionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!isMentionMenuOpen) {
        return false;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedMentionIndex((previous) =>
          mentionSuggestions.length === 0
            ? 0
            : (previous + 1) % mentionSuggestions.length
        );
        return true;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedMentionIndex((previous) =>
          mentionSuggestions.length === 0
            ? 0
            : (previous - 1 + mentionSuggestions.length) %
              mentionSuggestions.length
        );
        return true;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const selected = mentionSuggestions[highlightedMentionIndex];
        if (selected) {
          selectMention(selected);
        }
        return true;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedMentionKey(mentionTriggerKey);
        return true;
      }

      return false;
    },
    [
      highlightedMentionIndex,
      isMentionMenuOpen,
      mentionSuggestions,
      mentionTriggerKey,
      selectMention,
    ]
  );

  const handleTextareaKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (handleMentionKeyDown(event)) {
        return;
      }

      if (
        !isMobile &&
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        if (canSend) {
          runSubmitForm();
        }
      }
    },
    [canSend, handleMentionKeyDown, isMobile, runSubmitForm]
  );

  return (
    <div
      className={cn(
        "group relative flex h-full w-full grow flex-col overflow-visible rounded-lg border border-border bg-secondary transition-colors duration-200 focus-within:bg-secondary focus-within:ring-1 focus-within:ring-ring/30",
        centered ? "min-h-32" : "min-h-28"
      )}
    >
      <input
        className="pointer-events-none fixed -top-4 -left-4 size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      <div className="relative px-3 pt-3.5 pb-2 sm:px-4 sm:pt-4">
        <AnimatePresence initial={false}>
          {attachments.length > 0 ? (
            <motion.div
              animate={{ height: "auto", opacity: 1, y: 0 }}
              className="overflow-hidden px-0.5 pb-2.5"
              exit={{ height: 0, opacity: 0, y: -8 }}
              initial={{ height: 0, opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {attachments.map((attachment) => (
                  <PreviewAttachment
                    attachment={attachment}
                    key={attachment.id}
                    onRemove={removeAttachment}
                    variant="composer"
                    workspaceUuid={workspaceUuid}
                  />
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="relative">
          {isMentionMenuOpen && (
            <div className="pointer-events-none absolute inset-x-[3px] bottom-full -z-10 mb-[-10px]">
              <Command>
                <div
                  className="scroll-fade-frame scroll-fade-top scroll-fade-bottom relative"
                  style={
                    {
                      "--scroll-fade-color": "var(--popover)",
                    } as React.CSSProperties
                  }
                >
                  <div className="pointer-events-auto relative overflow-hidden rounded-[20px] bg-secondary shadow-xl">
                    <CommandList className="max-h-64">
                      {mentionSuggestions.map((file, index) => (
                        <CommandItem
                          aria-label={`Attach ${file.workspacePath}`}
                          className={cn(
                            "cursor-pointer select-none gap-2",
                            index === highlightedMentionIndex &&
                              "bg-accent text-accent-foreground"
                          )}
                          key={file.id}
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onSelect={() => {
                            selectMention(file);
                          }}
                          ref={(node) => {
                            mentionItemRefs.current[index] = node;
                          }}
                          value={file.workspacePath}
                        >
                          <FileTextIcon className="size-4 text-muted-foreground/80" />
                          <span className="flex min-w-0 items-center gap-1.5 truncate">
                            <span className="truncate">{file.name}</span>
                          </span>
                          <span className="truncate text-muted-foreground/70 text-xs">
                            {file.parentPath || "Workspace root"}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </div>
                </div>

                {mentionSuggestions.length === 0 && (
                  <CommandEmpty className="px-3 py-2 text-muted-foreground/70 text-xs">
                    No matching workspace files.
                  </CommandEmpty>
                )}
              </Command>
            </div>
          )}

          <div className="relative z-10 rounded-[22px] bg-secondary">
            <div className="flex min-h-16 items-start">
              <Textarea
                autoFocus
                className={cn(
                  "relative z-10 min-h-16 min-w-[14rem] flex-1 resize-none overflow-visible border-none! bg-transparent! px-0! pb-2 text-[17px] leading-7 shadow-none! ring-0! focus-visible:border-transparent! focus-visible:ring-0! [&::-webkit-scrollbar-thumb]:bg-background",
                  className
                )}
                data-testid="multimodal-input"
                enterKeyHint={isMobile ? "enter" : "send"}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setDismissedMentionKey(null);
                  latestInputRef.current = nextValue;
                  setInput(nextValue);
                  setLocalStorageInput(nextValue);
                  updateTextareaSelection(
                    event.target.selectionStart ?? 0,
                    event.target.selectionEnd ?? 0
                  );
                }}
                onClick={() => {
                  updateTextareaSelection();
                }}
                onKeyDown={handleTextareaKeyDown}
                onKeyUp={() => {
                  updateTextareaSelection();
                }}
                onPaste={(event) => {
                  const pastedFiles: File[] = [];
                  for (const item of Array.from(event.clipboardData.items)) {
                    if (
                      item.kind !== "file" ||
                      !item.type.startsWith("image/")
                    ) {
                      continue;
                    }
                    const file = item.getAsFile();
                    if (file) {
                      pastedFiles.push(file);
                    }
                  }

                  if (pastedFiles.length > 0) {
                    enqueueFiles(pastedFiles);
                    toast.success(
                      `Added ${pastedFiles.length} pasted image${pastedFiles.length > 1 ? "s" : ""}.`
                    );
                  }
                }}
                onSelect={() => {
                  updateTextareaSelection();
                }}
                placeholder="Ask anything or type @ to attach a workspace file"
                ref={textareaRef}
                rows={2}
                value={input}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-nowrap items-center justify-between gap-2 px-2.5 pt-2.5 pb-2.5 sm:gap-0 sm:px-3 sm:pt-3 sm:pb-3">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <AttachmentsButton
              onClick={() => fileInputRef.current?.click()}
              status={status}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <SendButton
              canSend={canSend}
              status={status}
              submitForm={runSubmitForm}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) =>
    prevProps.input === nextProps.input &&
    prevProps.status === nextProps.status &&
    prevProps.attachments === nextProps.attachments &&
    prevProps.workspaceUuid === nextProps.workspaceUuid
);

function PureAttachmentsButton({
  onClick,
  status,
}: {
  onClick: () => void;
  status: UseChatHelpers<UIMessage>["status"];
}) {
  return (
    <Button
      className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
      data-testid="attachments-button"
      disabled={status === "submitted" || status === "streaming"}
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
      size="sm"
      type="button"
      variant="ghost"
    >
      <PaperclipIcon className="h-5 w-5" />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureSendButton({
  submitForm,
  canSend,
  status,
}: {
  submitForm: () => void;
  canSend: boolean;
  status: UseChatHelpers<UIMessage>["status"];
}) {
  if (status === "submitted" || status === "streaming") {
    return (
      <Button
        aria-label="Generating response"
        className="h-9 w-9 rounded-full bg-muted text-muted-foreground sm:h-8 sm:w-8"
        data-testid="loading-button"
        disabled
        size="icon"
        type="button"
        variant="ghost"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  return (
    <Button
      aria-label="Send message"
      className="h-9 w-9 rounded-full sm:h-8 sm:w-8"
      data-testid="send-button"
      disabled={!canSend}
      onClick={(event) => {
        event.preventDefault();
        if (canSend) {
          submitForm();
        }
      }}
      size="icon"
      type="button"
      variant="default"
    >
      <ArrowUpIcon className="h-4 w-4" />
    </Button>
  );
}

const SendButton = memo(
  PureSendButton,
  (prevProps, nextProps) =>
    prevProps.canSend === nextProps.canSend &&
    prevProps.status === nextProps.status
);
