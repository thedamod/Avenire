import { createUploadthing } from "uploadthing/next";

export { createRouteHandler, type FileRouter } from "uploadthing/next";
export { extractRouterConfig, UploadThingError as UploadError, UTApi, UTFile } from "uploadthing/server";

export const storage: ReturnType<typeof createUploadthing> = createUploadthing();
