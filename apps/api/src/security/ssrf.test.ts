import { describe, expect, it, vi } from "vitest";

import { assertOutboundUrl, SsrfBlockedError } from "./ssrf.js";
import type { DnsResolver } from "./ssrf.js";

const blocked = [
  "http://localhost/admin",
  "http://LOCALHOST/admin",
  "http://127.0.0.1/admin",
  "http://127.255.255.255/admin",
  "http://10.1.2.3/admin",
  "http://172.16.0.1/admin",
  "http://172.31.255.255/admin",
  "http://192.168.1.20/admin",
  "http://169.254.169.254/latest",
  "http://[::1]/admin",
  "http://metadata.google.internal/computeMetadata/v1/",
];

describe("assertOutboundUrl", () => {
  it("allows public http and https URLs", async () => {
    const resolve: DnsResolver = async () => [{ address: "1.1.1.1", family: 4 }];
    await expect(assertOutboundUrl("https://alerts.example.com/hook", false, resolve)).resolves.toMatchObject({
      href: "https://alerts.example.com/hook",
    });
    await expect(assertOutboundUrl("http://8.8.8.8/dns")).resolves.toMatchObject({ hostname: "8.8.8.8" });
    await expect(assertOutboundUrl("http://172.32.0.1/outside")).resolves.toMatchObject({
      hostname: "172.32.0.1",
    });
  });

  it("blocks private, loopback, link-local, and metadata hosts", async () => {
    for (const url of blocked) {
      await expect(assertOutboundUrl(url)).rejects.toThrow(SsrfBlockedError);
    }
  });

  it("blocks non-http protocols", async () => {
    await expect(assertOutboundUrl("ftp://alerts.example.com/hook")).rejects.toThrow(SsrfBlockedError);
  });

  it("blocks an unparseable URL", async () => {
    await expect(assertOutboundUrl("not a url")).rejects.toThrow(SsrfBlockedError);
  });

  it("allows private hosts only when the override is enabled", async () => {
    await expect(assertOutboundUrl("http://127.0.0.1:9000/alerts", true)).resolves.toMatchObject({
      hostname: "127.0.0.1",
    });
  });

  it("still blocks non-http protocols when the private-host override is enabled", async () => {
    await expect(assertOutboundUrl("ftp://127.0.0.1/alerts", true)).rejects.toThrow(SsrfBlockedError);
  });

  it("blocks a hostname that resolves to a private address", async () => {
    const resolve: DnsResolver = async () => [{ address: "10.1.2.3", family: 4 }];
    await expect(assertOutboundUrl("https://alerts.example.com/hook", false, resolve)).rejects.toThrow(
      SsrfBlockedError,
    );
  });

  it("blocks a hostname that resolves to loopback, link-local, or metadata addresses", async () => {
    const addresses = ["127.0.0.1", "169.254.169.254", "::1", "fe80::1", "::ffff:10.0.0.1"];
    for (const address of addresses) {
      const resolve: DnsResolver = async () => [{ address, family: address.includes(":") ? 6 : 4 }];
      await expect(assertOutboundUrl("https://alerts.example.com/hook", false, resolve)).rejects.toThrow(
        SsrfBlockedError,
      );
    }
  });

  it("blocks a hostname when any resolved address is private", async () => {
    const resolve: DnsResolver = async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "192.168.1.9", family: 4 },
    ];
    await expect(assertOutboundUrl("https://alerts.example.com/hook", false, resolve)).rejects.toThrow(
      SsrfBlockedError,
    );
  });

  it("blocks a hostname when DNS resolution fails", async () => {
    const resolve: DnsResolver = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(assertOutboundUrl("https://alerts.example.com/hook", false, resolve)).rejects.toThrow(
      SsrfBlockedError,
    );
  });

  it("allows a hostname that resolves only to public addresses", async () => {
    const resolve = vi.fn<DnsResolver>(async () => [
      { address: "1.1.1.1", family: 4 },
      { address: "2001:4860:4860::8888", family: 6 },
    ]);
    await expect(assertOutboundUrl("https://alerts.example.com/hook", false, resolve)).resolves.toMatchObject({
      hostname: "alerts.example.com",
    });
    expect(resolve).toHaveBeenCalledWith("alerts.example.com");
  });

  it("allows a privately resolved hostname when the override is enabled", async () => {
    const resolve = vi.fn<DnsResolver>(async () => [{ address: "127.0.0.1", family: 4 }]);
    await expect(assertOutboundUrl("https://internal.example/alerts", true, resolve)).resolves.toMatchObject({
      hostname: "internal.example",
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("does not resolve a literal IP address", async () => {
    const resolve = vi.fn<DnsResolver>(async () => [{ address: "10.0.0.1", family: 4 }]);
    await expect(assertOutboundUrl("http://8.8.8.8/dns", false, resolve)).resolves.toMatchObject({
      hostname: "8.8.8.8",
    });
    expect(resolve).not.toHaveBeenCalled();
  });
});
