import { storage, type FileRouter } from "@avenire/storage";

export const router = {
  imageUploader: storage({
    image: { maxFileSize: "4MB", maxFileCount: 1 }
  }).onUploadComplete(async ({ file }) => ({
    url: file.ufsUrl
  }))
} satisfies FileRouter;

export type UploadRouter = typeof router;
