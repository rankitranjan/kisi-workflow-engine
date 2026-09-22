import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export class SsrfBlockedError extends Error {
  constructor() {
    super("blocked URL");
    this.name = "SsrfBlockedError";
  }
}

export type DnsAddress = {
  address: string;
  family: 4 | 6;
};

export type DnsResolver = (hostname: string) => Promise<readonly DnsAddress[]>;

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

const blockedAddresses = new BlockList();
blockedAddresses.addSubnet("127.0.0.0", 8, "ipv4");
blockedAddresses.addSubnet("10.0.0.0", 8, "ipv4");
blockedAddresses.addSubnet("172.16.0.0", 12, "ipv4");
blockedAddresses.addSubnet("192.168.0.0", 16, "ipv4");
blockedAddresses.addSubnet("169.254.0.0", 16, "ipv4");
blockedAddresses.addAddress("::1", "ipv6");
blockedAddresses.addSubnet("fe80::", 10, "ipv6");
blockedAddresses.addSubnet("fc00::", 7, "ipv6");

function normalizeHost(hostname: string): string {
  let host = hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (host.endsWith(".")) {
    host = host.slice(0, -1);
  }
  return host;
}

function isBlockedIp(address: string): boolean {
  const version = isIP(address);
  if (version === 0) {
    return false;
  }
  return blockedAddresses.check(address, version === 6 ? "ipv6" : "ipv4");
}

function isBlockedResolvedAddress(address: string): boolean {
  return isIP(address) === 0 || isBlockedIp(address);
}

export async function resolveHostname(hostname: string): Promise<readonly DnsAddress[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({
    address: record.address,
    family: record.family === 6 ? 6 : 4,
  }));
}

async function assertResolvedAddresses(host: string, resolve: DnsResolver): Promise<void> {
  let addresses: readonly DnsAddress[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new SsrfBlockedError();
  }
  if (addresses.length === 0 || addresses.some((record) => isBlockedResolvedAddress(record.address))) {
    throw new SsrfBlockedError();
  }
}

export async function assertOutboundUrl(
  url: string,
  allowPrivateUrls = false,
  resolve: DnsResolver = resolveHostname,
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfBlockedError();
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlockedError();
  }
  if (allowPrivateUrls) {
    return parsed;
  }
  const host = normalizeHost(parsed.hostname);
  if (BLOCKED_HOSTS.has(host) || isBlockedIp(host)) {
    throw new SsrfBlockedError();
  }
  if (isIP(host) === 0) {
    await assertResolvedAddresses(host, resolve);
  }
  return parsed;
}
