import { normalizeMediaType } from "@/lib/media-type";

export type AttachmentStatus = "pending" | "uploading" | "completed" | "failed";
export type AttachmentSource = "local" | "workspace";

export interface Attachment {
  contentType: string;
  errorMessage?: string;
  file?: File;
  id: string;
  name: string;
  sizeBytes?: number;
  source?: AttachmentSource;
  status: AttachmentStatus;
  storageKey?: string;
  url: string;
  workspaceFileId?: string;
  workspacePath?: string;
}

export const createLocalAttachment = (file: File): Attachment => ({
  id: crypto.randomUUID(),
  file,
  name: file.name,
  url: URL.createObjectURL(file),
  contentType: normalizeMediaType(file.type),
  source: "local",
  sizeBytes: file.size,
  status: "pending",
});

export const createWorkspaceAttachment = (input: {
  contentType: string | null | undefined;
  id: string;
  name: string;
  sizeBytes?: number;
  url: string;
  workspacePath: string;
}): Attachment => ({
  id: crypto.randomUUID(),
  contentType: normalizeMediaType(input.contentType),
  name: input.name,
  sizeBytes: input.sizeBytes,
  source: "workspace",
  status: "completed",
  url: input.url,
  workspaceFileId: input.id,
  workspacePath: input.workspacePath,
});

export const revokeAttachmentUrl = (url: string) => {
  if (!url.startsWith("blob:")) {
    return;
  }
  URL.revokeObjectURL(url);
};
