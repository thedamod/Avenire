import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_V4_PREFIXES = [
  "10.",
  "127.",
  "169.254.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  "192.168.",
  "0.",
];

const PRIVATE_V6_PREFIXES = ["::1", "fc", "fd", "fe80"];

const isDisallowedIpHost = (host: string): boolean => {
  const ipType = isIP(host);
  if (
    ipType === 4 &&
    PRIVATE_V4_PREFIXES.some((prefix) => host.startsWith(prefix))
  ) {
    return true;
  }

  if (
    ipType === 6 &&
    PRIVATE_V6_PREFIXES.some((prefix) => host.startsWith(prefix))
  ) {
    return true;
  }

  return false;
};

const normalizeHostname = (hostname: string): string =>
  hostname.toLowerCase().replace(/\.+$/g, "");

const resolvePublicIps = async (hostname: string): Promise<string[]> => {
  const [v4, v6] = await Promise.allSettled([
    resolve4(hostname),
    resolve6(hostname),
  ]);

  const ips = [
    ...(v4.status === "fulfilled" ? v4.value : []),
    ...(v6.status === "fulfilled" ? v6.value : []),
  ];

  return Array.from(new Set(ips.map((ip) => normalizeHostname(ip))));
};

export const assertSafeUrl = async (value: string): Promise<URL> => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Unsupported URL protocol for ingestion: ${parsed.protocol}`
    );
  }

  const host = normalizeHostname(parsed.hostname);
  parsed.hostname = host;
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("Localhost URLs are not allowed for ingestion.");
  }

  if (isDisallowedIpHost(host)) {
    throw new Error("Private IP URLs are not allowed for ingestion.");
  }

  if (isIP(host) === 0) {
    const resolvedIps = await resolvePublicIps(host);
    if (resolvedIps.length === 0) {
      throw new Error(`Unable to resolve host for ingestion: ${host}`);
    }

    if (resolvedIps.some((ip) => isDisallowedIpHost(ip))) {
      throw new Error("Host resolves to a private or loopback IP.");
    }
  }

  return parsed;
};

export const assertMaxSize = (
  name: string,
  size: number,
  maxSize: number
): void => {
  if (size > maxSize) {
    throw new Error(`${name} exceeds max size (${size} > ${maxSize} bytes).`);
  }
};

export const decodeBase64ToBytes = (input: string): Uint8Array => {
  const normalized = input.includes(",")
    ? input.slice(input.indexOf(",") + 1)
    : input;
  return Uint8Array.from(Buffer.from(normalized, "base64"));
};
