export interface CachedUploadThingFile {
  key: string;
  name: string;
  size: number;
  uploadedAt: number;
  url: string;
  contentType?: string;
}

interface CachedPayload {
  cachedAt: number;
  files: CachedUploadThingFile[];
}

const DB_NAME = "avenire-file-cache";
const DB_VERSION = 1;
const STORE_NAME = "cache";
const CACHE_KEY = "uploadthing-files-v1";

/**
 * Determines whether a value is a non-null object.
 *
 * @returns `true` if `value` is an object and not `null`, `false` otherwise.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Determines whether a value matches the shape of a CachedUploadThingFile.
 *
 * @param value - The value to validate
 * @returns `true` if `value` matches the `CachedUploadThingFile` shape, `false` otherwise.
 */
function isValidCachedFile(value: unknown): value is CachedUploadThingFile {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.key === "string" &&
    value.key.length > 0 &&
    typeof value.name === "string" &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    typeof value.uploadedAt === "number" &&
    Number.isFinite(value.uploadedAt) &&
    typeof value.url === "string" &&
    value.url.startsWith("http") &&
    (typeof value.contentType === "string" || typeof value.contentType === "undefined")
  );
}

/**
 * Determines whether a value is a valid CachedPayload object.
 *
 * @param value - The value to validate
 * @returns `true` if `value` is an object with a numeric `cachedAt` and a `files` array where every element is a valid `CachedUploadThingFile`, `false` otherwise.
 */
function isValidPayload(value: unknown): value is CachedPayload {
  if (!isObject(value)) {
    return false;
  }

  if (typeof value.cachedAt !== "number" || !Array.isArray(value.files)) {
    return false;
  }

  return value.files.every(isValidCachedFile);
}

/**
 * Open and initialize the file cache IndexedDB database, creating the object store if required.
 *
 * @returns The opened IDBDatabase instance.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Reads a value by key from the cache object store in the provided IndexedDB database.
 *
 * @param database - An open `IDBDatabase` containing the cache object store
 * @param key - The key of the record to retrieve from the store
 * @returns The stored value for `key`, or `null` if no record exists
 */
function getValue<T>(database: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve((request.result as T | undefined) ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Store a value in the cache object store under the given key.
 *
 * @param key - The record key to use when storing `value`
 * @param value - The value to persist in the cache
 * @returns `void`
 */
function setValue(database: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Reads cached UploadThing file metadata from the client-side IndexedDB cache.
 *
 * Returns an array of valid cached file entries previously stored under the cache key.
 * If running outside a browser environment, IndexedDB is unavailable, the stored payload is missing or invalid, or an error occurs, this function returns an empty array.
 *
 * @returns An array of `CachedUploadThingFile` objects; an empty array if no valid cache is available.
 */
export async function readUploadThingCache(): Promise<CachedUploadThingFile[]> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return [];
  }

  try {
    const database = await openDb();
    const payload = await getValue<unknown>(database, CACHE_KEY);

    if (!isValidPayload(payload)) {
      return [];
    }

    return payload.files;
  } catch {
    return [];
  }
}

/**
 * Persist a list of UploadThing file metadata to the browser IndexedDB cache.
 *
 * Attempts to store a payload containing the current timestamp and the provided files under the cache key.
 * The function is a no-op when running outside a browser or when IndexedDB is unavailable.
 * Only files that pass runtime validation are persisted; write errors are caught and ignored.
 *
 * @param files - Array of file metadata to cache; invalid entries are filtered out before storing
 */
export async function writeUploadThingCache(files: CachedUploadThingFile[]): Promise<void> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return;
  }

  try {
    const validFiles = files.filter(isValidCachedFile);
    const database = await openDb();
    await setValue(database, CACHE_KEY, {
      cachedAt: Date.now(),
      files: validFiles,
    } satisfies CachedPayload);
  } catch {
    // Ignore cache write errors.
  }
}
