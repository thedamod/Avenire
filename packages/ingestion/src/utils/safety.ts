import { isIP } from 'node:net';

const PRIVATE_V4_PREFIXES = [
  '10.',
  '127.',
  '169.254.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.2',
  '172.30.',
  '172.31.',
  '192.168.',
  '0.',
];

const PRIVATE_V6_PREFIXES = ['::1', 'fc', 'fd', 'fe80'];

export const assertSafeUrl = (value: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol for ingestion: ${parsed.protocol}`);
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error('Localhost URLs are not allowed for ingestion.');
  }

  const ipType = isIP(host);
  if (ipType === 4 && PRIVATE_V4_PREFIXES.some(prefix => host.startsWith(prefix))) {
    throw new Error('Private IPv4 URLs are not allowed for ingestion.');
  }

  if (ipType === 6 && PRIVATE_V6_PREFIXES.some(prefix => host.startsWith(prefix))) {
    throw new Error('Private IPv6 URLs are not allowed for ingestion.');
  }

  return parsed;
};

export const assertMaxSize = (name: string, size: number, maxSize: number): void => {
  if (size > maxSize) {
    throw new Error(`${name} exceeds max size (${size} > ${maxSize} bytes).`);
  }
};

export const decodeBase64ToBytes = (input: string): Uint8Array => {
  const normalized = input.includes(',') ? input.slice(input.indexOf(',') + 1) : input;
  return Uint8Array.from(Buffer.from(normalized, 'base64'));
};
