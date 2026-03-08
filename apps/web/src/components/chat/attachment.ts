export type AttachmentStatus = "pending" | "uploading" | "completed" | "failed";

export interface Attachment {
  contentType: string;
  errorMessage?: string;
  file?: File;
  id: string;
  name: string;
  status: AttachmentStatus;
  storageKey?: string;
  url: string;
}

export const createLocalAttachment = (file: File): Attachment => ({
  id: crypto.randomUUID(),
  file,
  name: file.name,
  url: URL.createObjectURL(file),
  contentType: file.type || "application/octet-stream",
  status: "pending",
});

export const revokeAttachmentUrl = (url: string) => {
  if (!url.startsWith("blob:")) {
    return;
  }
  URL.revokeObjectURL(url);
};
