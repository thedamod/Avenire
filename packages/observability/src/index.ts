import { Axiom } from "@axiomhq/js";

const token = process.env.AXIOM_TOKEN;
const dataset = process.env.AXIOM_DATASET;
const service = process.env.OBSERVABILITY_SERVICE ?? "web";

const axiom = token ? new Axiom({ token }) : null;

export type LogLevel = "info" | "warn" | "error" | "meter";

export interface ObservabilityContext {
  service?: string;
  route?: string;
  requestId?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  feature?: string | null;
  [key: string]: unknown;
}

export interface ObservabilityEvent {
  eventName: string;
  payload?: Record<string, unknown>;
  context?: ObservabilityContext;
}

const REDACTED_KEYS = new Set([
  "authorization",
  "cookie",
  "cookies",
  "email",
  "fileName",
  "file_name",
  "message",
  "messages",
  "name",
  "prompt",
  "storageKey",
  "storageUrl",
  "text",
  "token",
]);

function normalizeRedactedKey(key: string) {
  return key.toLowerCase();
}

function isRedactedKey(key: string) {
  return REDACTED_KEYS.has(normalizeRedactedKey(key));
}

function shouldEnableObservability() {
  const envValue = process.env.OBSERVABILITY_ENABLED;
  if (envValue === "false") {
    return false;
  }

  if (envValue === "true") {
    return true;
  }

  return process.env.NODE_ENV === "production";
}

function getSampleRate() {
  const raw = Number.parseFloat(process.env.OBSERVABILITY_SAMPLE_RATE ?? "1");
  if (!Number.isFinite(raw)) {
    return 1;
  }

  return Math.min(1, Math.max(0, raw));
}

function shouldSample() {
  return Math.random() <= getSampleRate();
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (isRedactedKey(key)) {
      redacted[key] = "[REDACTED]";
      continue;
    }
    redacted[key] = redactValue(entry);
  }

  return redacted;
}

function redactObject(value: Record<string, unknown>) {
  return redactValue(value) as Record<string, unknown>;
}

function redactErrorText(input?: string) {
  if (!input) {
    return undefined;
  }

  let result = input;
  for (const key of REDACTED_KEYS) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(${escapedKey}\\s*[:=]\\s*)([^\\s,;]+)`, "gi");
    result = result.replace(pattern, "$1[REDACTED]");
  }

  return result;
}

export function safeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactErrorText(error.message),
      stack: redactErrorText(error.stack),
    };
  }

  if (typeof error === "string") {
    return { message: redactErrorText(error) };
  }

  return { message: "Unknown error", value: redactValue(error) };
}

async function ingest(level: LogLevel, input: ObservabilityEvent) {
  if (!shouldEnableObservability()) {
    return;
  }

  if (!shouldSample()) {
    return;
  }

  const payload = redactObject(input.payload ?? {});
  const context = redactObject(input.context ?? {});
  const record = {
    timestamp: new Date().toISOString(),
    level,
    eventName: input.eventName,
    service,
    ...context,
    ...payload,
  };

  if (!axiom || !dataset) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[axiom-disabled]", record);
    }
    return;
  }

  try {
    await axiom.ingest(dataset, [record]);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[axiom-ingest-failed]", safeError(error));
    }
  }
}

export function scopedLogger(context: ObservabilityContext) {
  return {
    info(eventName: string, payload?: Record<string, unknown>) {
      return ingest("info", { eventName, payload, context });
    },
    warn(eventName: string, payload?: Record<string, unknown>) {
      return ingest("warn", { eventName, payload, context });
    },
    error(eventName: string, payload?: Record<string, unknown>) {
      return ingest("error", { eventName, payload, context });
    },
    meter(eventName: string, payload?: Record<string, unknown>) {
      return ingest("meter", { eventName, payload, context });
    },
  };
}

export function logInfo(input: ObservabilityEvent) {
  return ingest("info", input);
}

export function logWarn(input: ObservabilityEvent) {
  return ingest("warn", input);
}

export function logError(input: ObservabilityEvent) {
  return ingest("error", input);
}

export function meter(input: ObservabilityEvent) {
  return ingest("meter", input);
}

export async function logEvent(eventName: string, payload: Record<string, unknown>) {
  await logInfo({
    eventName,
    payload,
  });
}
