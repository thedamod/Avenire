"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "@avenire/ai/message-types";
import { Button } from "@avenire/ui/components/button";
import { Textarea } from "@avenire/ui/components/textarea";
import { ArrowUpIcon, PaperclipIcon, StopCircle } from "lucide-react";
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
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import {
  type Attachment,
  createLocalAttachment,
  revokeAttachmentUrl,
} from "@/components/chat/attachment";
import { PreviewAttachment } from "@/components/chat/preview-attachment";
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

/**
 * Renders a multimodal chat input UI that supports text entry, file attachments, previews, and automatic upload management.
 *
 * The component persists input to localStorage, auto-resizes the textarea, enqueues pasted or selected image files (up to 3),
 * uploads attachments sequentially, and exposes send/stop controls that respect the chat status. Submitting clears input and attachments
 * and revokes any temporary URLs.
 *
 * @param input - The current text value of the input.
 * @param setInput - Setter for the text input value.
 * @param status - Current chat status used to disable controls or show the stop action (e.g., "submitted" or "streaming").
 * @param stop - Function to stop an ongoing AI response when the chat is busy.
 * @param attachments - Array of attachment objects representing local or uploaded files and their statuses.
 * @param setAttachments - State setter for the attachments array.
 * @param handleSubmit - Callback invoked with completed (uploaded) attachments when the user submits.
 * @param className - Optional additional CSS classes applied to the textarea.
 * @param centered - Optional layout flag that adjusts container rounding when true.
 * @returns A React element rendering the multimodal input, attachment previews, and controls.
 */
function PureMultimodalInput({
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  handleSubmit,
  className,
  centered = false,
}: {
  input: string;
  setInput: (input: string) => void;
  status: UseChatHelpers<UIMessage>["status"];
  stop: UseChatHelpers<UIMessage>["stop"];
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  handleSubmit: (files: Attachment[]) => void;
  className?: string;
  centered?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasHydratedInputRef = useRef(false);
  const uploadingIdsRef = useRef(new Set<string>());
  const { width } = useWindowSize();
  const MAX_FILES = 3;
  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "chat-input",
    "",
  );

  const { startUpload } = useUploadThing("chatAttachmentUploader", {
    onUploadError: () => {
      toast.error(ERROR_MESSAGES.UPLOAD_ERROR);
    },
  });

  const uploadQueue = useMemo(
    () =>
      attachments.filter(
        (attachment) =>
          attachment.status === "pending" || attachment.status === "uploading",
      ),
    [attachments],
  );

  const completedAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.status === "completed"),
    [attachments],
  );

  const canSend = useMemo(
    () =>
      (input.trim().length > 0 || completedAttachments.length > 0) &&
      uploadQueue.length === 0,
    [completedAttachments.length, input, uploadQueue.length],
  );

  useEffect(() => {
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
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const updateAttachment = useCallback(
    (id: string, update: Partial<Attachment>) => {
      setAttachments((prev) =>
        prev.map((attachment) =>
          attachment.id === id ? { ...attachment, ...update } : attachment,
        ),
      );
    },
    [setAttachments],
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

        const uploadedUrl =
          ("ufsUrl" in uploaded && uploaded.ufsUrl) ||
          ("url" in uploaded && uploaded.url);

        if (!uploadedUrl) {
          throw new Error("Upload returned no URL");
        }

        revokeAttachmentUrl(attachment.url);

        updateAttachment(attachment.id, {
          status: "completed",
          url: uploadedUrl,
          storageKey: "key" in uploaded ? uploaded.key : undefined,
        });
      } catch {
        updateAttachment(attachment.id, {
          status: "failed",
          errorMessage: ERROR_MESSAGES.UPLOAD_ERROR,
        });
      }
    },
    [startUpload, updateAttachment],
  );

  useEffect(() => {
    const pending = attachments.filter(
      (attachment) =>
        attachment.status === "pending" &&
        Boolean(attachment.file) &&
        !uploadingIdsRef.current.has(attachment.id),
    );

    if (pending.length === 0) {
      return;
    }

    for (const attachment of pending) {
      uploadingIdsRef.current.add(attachment.id);
    }

    void (async () => {
      for (const attachment of pending) {
        await uploadAttachment(attachment);
        uploadingIdsRef.current.delete(attachment.id);
      }
    })();
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
    [attachments.length, setAttachments],
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    enqueueFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      setAttachments((prev) => {
        const selected = prev.find(
          (attachment) => attachment.id === attachmentId,
        );
        if (!selected) {
          return prev;
        }
        revokeAttachmentUrl(selected.url);
        return prev.filter((attachment) => attachment.id !== attachmentId);
      });
    },
    [setAttachments],
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

    handleSubmit(completedAttachments);

    for (const attachment of attachments) {
      revokeAttachmentUrl(attachment.url);
    }

    setAttachments([]);
    setInput("");
    setLocalStorageInput("");
    resetHeight();

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    attachments,
    completedAttachments,
    handleSubmit,
    input,
    setAttachments,
    setInput,
    setLocalStorageInput,
    status,
    width,
  ]);

  return (
    <div
      className={cn(
        "relative flex h-full w-full grow flex-col gap-4 overflow-hidden rounded-2xl border border-border/70 bg-background/35 px-2 py-2 backdrop-blur-md",
        centered ? "rounded-b-2xl" : "rounded-b-none",
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

      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            animate={{ opacity: 1, height: "auto" }}
            className="flex flex-wrap gap-2 p-3 pb-4"
            exit={{ opacity: 0, height: 0 }}
            initial={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                attachment={attachment}
                key={attachment.id}
                onRemove={removeAttachment}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex w-full flex-1 flex-col items-start">
        <div className="flex w-full flex-row items-start gap-4 bg-transparent px-1">
          <Textarea
            autoFocus
            className={cn(
              "max-h-[calc(30dvh)] min-h-6 resize-none overflow-visible border-none! bg-transparent! pb-10 shadow-none! ring-0! focus-visible:border-transparent! focus-visible:ring-0! [&::-webkit-scrollbar-thumb]:bg-background",
              className,
            )}
            data-testid="multimodal-input"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (canSend) {
                  void submitForm();
                }
              }
            }}
            onPaste={(event) => {
              const pastedFiles: File[] = [];
              for (const item of Array.from(event.clipboardData.items)) {
                if (item.kind !== "file" || !item.type.startsWith("image/")) {
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
                  `Added ${pastedFiles.length} pasted image${pastedFiles.length > 1 ? "s" : ""}.`,
                );
              }
            }}
            placeholder="Send a message..."
            ref={textareaRef}
            rows={2}
            value={input}
          />

          <div className="flex w-fit flex-row justify-start pt-1">
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{ display: "contents" }}
            >
              <AttachmentsButton status={status} />
            </div>
          </div>

          <div className="flex w-fit flex-row justify-end pt-1">
            <SendButton
              canSend={canSend}
              status={status}
              stop={stop}
              submitForm={submitForm}
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
    prevProps.attachments === nextProps.attachments,
);

/**
 * Render the attachments icon button and disable it while the chat is submitting or streaming.
 *
 * @param status - Current chat status used to determine whether the button should be disabled
 * @returns A button element for attaching files (icon-only, ghost variant)
 */
function PureAttachmentsButton({
  status,
}: {
  status: UseChatHelpers<UIMessage>["status"];
}) {
  return (
    <Button
      className="transition-colors"
      data-testid="attachments-button"
      disabled={status === "submitted" || status === "streaming"}
      onClick={(event) => {
        event.preventDefault();
      }}
      size="icon-lg"
      type="button"
      variant="ghost"
    >
      <PaperclipIcon className="h-5 w-5" />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

/**
 * Render the action button for the input area that switches between a send button and a stop button based on chat status.
 *
 * @param submitForm - Callback invoked to submit the current input when the send button is pressed
 * @param canSend - Whether sending is currently allowed; when false the send button is disabled
 * @param status - Current chat status which determines whether the stop button (for "submitted" or "streaming") is shown
 * @param stop - Callback invoked to stop an ongoing response when the stop button is pressed
 * @returns The JSX element for the send or stop button
 */
function PureSendButton({
  submitForm,
  canSend,
  status,
  stop,
}: {
  submitForm: () => void | Promise<void>;
  canSend: boolean;
  status: UseChatHelpers<UIMessage>["status"];
  stop: UseChatHelpers<UIMessage>["stop"];
}) {
  if (status === "submitted" || status === "streaming") {
    return (
      <Button
        className="transition-colors"
        data-testid="loading-button"
        onClick={stop}
        size="icon-lg"
        variant="ghost"
      >
        <StopCircle className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Button
      className="transition-colors"
      data-testid="send-button"
      disabled={!canSend}
      onClick={(event) => {
        event.preventDefault();
        if (canSend) {
          void submitForm();
        }
      }}
      size="icon-lg"
      variant="ghost"
    >
      <ArrowUpIcon className="h-5 w-5" />
    </Button>
  );
}

const SendButton = memo(
  PureSendButton,
  (prevProps, nextProps) =>
    prevProps.canSend === nextProps.canSend &&
    prevProps.status === nextProps.status,
);
