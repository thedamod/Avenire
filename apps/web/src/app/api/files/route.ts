import { auth } from "@avenire/auth/server";
import { UTApi } from "@avenire/storage";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

interface UploadThingServerFile {
  contentType?: string;
  key: string;
  name: string;
  size: number;
  uploadedAt: number;
  url: string;
}

/**
 * Infers a common MIME content type from a file name's extension.
 *
 * @param name - File name or path; used to extract the extension (e.g., "photo.png", "docs/report.pdf")
 * @returns The corresponding MIME type (for example, `image/png`, `application/pdf`, `text/plain`) or `undefined` if the extension is missing or not recognized
 */
function inferContentType(name: string): string | undefined {
  const extension = name.split(".").pop()?.toLowerCase();

  if (!extension) {
    return undefined;
  }

  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) {
    return `image/${extension === "jpg" ? "jpeg" : extension}`;
  }

  if (extension === "pdf") {
    return "application/pdf";
  }

  if (["txt", "md"].includes(extension)) {
    return "text/plain";
  }

  return undefined;
}

/**
 * Normalize a raw value (typically an API response) into an array of UploadThingServerFile objects.
 *
 * Filters the input for entries that have string `key` and `name`, numeric finite `size` and `uploadedAt`,
 * then maps each valid entry to an UploadThingServerFile with `url` set to an empty string and `contentType`
 * inferred from the file name.
 *
 * @param input - The raw input to validate and normalize
 * @returns An array of normalized UploadThingServerFile objects; returns an empty array if `input` is not an array or contains no valid entries
 */
function normalizeFiles(input: unknown): UploadThingServerFile[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((entry): entry is { key: string; name: string; size: number; uploadedAt: number } => {
      if (typeof entry !== "object" || entry === null) {
        return false;
      }

      const candidate = entry as Record<string, unknown>;
      return (
        typeof candidate.key === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.size === "number" &&
        Number.isFinite(candidate.size) &&
        typeof candidate.uploadedAt === "number" &&
        Number.isFinite(candidate.uploadedAt)
      );
    })
    .map((entry) => ({
      key: entry.key,
      name: entry.name,
      size: entry.size,
      uploadedAt: entry.uploadedAt,
      url: "",
      contentType: inferContentType(entry.name),
    }));
}

/**
 * Handle GET requests to list the current user's uploaded files with their public URLs.
 *
 * Fetches up to 100 files for the authenticated user, normalizes the file metadata, resolves public URLs, 
 * filters out entries without a URL, and returns the resulting list sorted by `uploadedAt` descending.
 * Responds with HTTP 401 and an empty `files` array when there is no authenticated user.
 * If the UPLOADTHING_TOKEN environment variable is missing the endpoint returns an empty `files` array.
 *
 * @returns An object with a `files` array of hydrated file records (`key`, `name`, `size`, `uploadedAt`, `contentType`, `url`). 
 *          When unauthorized the `files` array is empty (response status 401). On missing token the `files` array is empty.
 *          If an internal error occurs the `files` array is empty and the response status is 500.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ files: [] }, { status: 401 });
  }

  if (!process.env.UPLOADTHING_TOKEN) {
    return NextResponse.json({ files: [] });
  }

  try {
    const utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });

    const listResponse = await utapi.listFiles({ limit: 100 });
    const files = normalizeFiles(listResponse.files);

    if (files.length === 0) {
      return NextResponse.json({ files: [] });
    }

    const urlsResponse = await utapi.getFileUrls(files.map((file) => file.key));
    const urlByKey = new Map(
      urlsResponse.data
        .filter((entry) => typeof entry?.key === "string" && typeof entry?.url === "string")
        .map((entry) => [entry.key, entry.url]),
    );

    const hydrated = files
      .map((file) => ({
        ...file,
        url: urlByKey.get(file.key) ?? "",
      }))
      .filter((file) => file.url.length > 0)
      .sort((a, b) => b.uploadedAt - a.uploadedAt);

    return NextResponse.json({ files: hydrated });
  } catch {
    return NextResponse.json({ files: [] }, { status: 500 });
  }
}
