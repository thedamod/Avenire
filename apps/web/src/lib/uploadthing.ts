import { generateReactHelpers } from "@avenire/storage/client";
import type { UploadRouter } from "@/lib/upload";

export const { useUploadThing } = generateReactHelpers<UploadRouter>();
