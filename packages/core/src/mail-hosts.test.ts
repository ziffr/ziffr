// Where a mail server saved on the page may be (spec 0025): only global unicast, IPv4 inside IPv6 judged by the
// IPv4 it carries, and names as written.
import { describe, expect, it } from "vitest";
import { innerIPv4, privateAddress, privateMailHost } from "./mail-hosts";

const REFUSED: [string, string][] = [
  ["0.0.0.0", "this network, 0/8"], ["0.1.2.3", "0/8"], ["10.0.0.1", "RFC 1918"], ["10.255.255.255", "RFC 1918"],
  ["100.64.0.1", "CGNAT"], ["100.127.255.254", "CGNAT"], ["127.0.0.1", "loopback"], ["127.53.0.1", "loopback"],
  ["169.254.169.254", "link-local, cloud metadata"], ["172.16.0.1", "RFC 1918"], ["172.31.255.255", "RFC 1918"],
  ["192.0.0.8", "IETF protocol assignments"], ["192.0.2.10", "TEST-NET-1"], ["192.168.1.1", "RFC 1918"],
  ["198.18.0.1", "benchmark"], ["198.19.255.255", "benchmark"], ["198.51.100.7", "TEST-NET-2"], ["203.0.113.9", "TEST-NET-3"],
  ["224.0.0.1", "multicast"], ["239.255.255.250", "multicast"], ["240.0.0.1", "reserved"], ["255.255.255.255", "broadcast"],
  ["::", "unspecified"], ["::1", "loopback"], ["fc00::1", "ULA"], ["fd12:3456::1", "ULA"], ["fe80::1", "link-local"],
  ["febf::1", "link-local"], ["ff02::1", "multicast"], ["2001:db8::25", "documentation"], ["2001:0:4136:e378::1", "Teredo"],
  ["100::1", "discard, outside 2000::/3"], ["::ffff:127.0.0.1", "mapped loopback"], ["::ffff:7f00:1", "mapped loopback, hex"],
  ["::ffff:10.0.0.1", "mapped RFC 1918"], ["::ffff:0:a00:1", "translated RFC 1918"], ["::10.0.0.1", "compatible RFC 1918"],
  ["::a9fe:a9fe", "compatible metadata"], ["64:ff9b::a9fe:a9fe", "NAT64 metadata"], ["64:ff9b::127.0.0.1", "NAT64 loopback"],
  ["2002:c0a8:101::1", "6to4 of 192.168.1.1"], ["2002:7f00:1::", "6to4 of loopback"], ["[::1]", "bracketed"], ["fe80::1%en0", "with zone"],
  ["not an address", "not an IP"], ["", "empty"],
];

const ALLOWED: [string, string][] = [
  ["93.184.216.34", "public"], ["8.8.8.8", "public"], ["1.1.1.1", "public"], ["100.63.255.255", "just below CGNAT"],
  ["100.128.0.0", "just above CGNAT"], ["172.15.255.255", "just below RFC 1918"], ["172.32.0.0", "just above RFC 1918"],
  ["198.17.255.255", "just below benchmark"], ["198.20.0.0", "just above benchmark"], ["223.255.255.255", "just below multicast"],
  ["2606:4700:4700::1111", "public IPv6"], ["2a00:1450:4001:80b::200e", "public IPv6"], ["::ffff:93.184.216.34", "mapped public"],
  ["64:ff9b::5db8:d822", "NAT64 public"], ["2002:5db8:d822::1", "6to4 public"],
];

describe("which addresses a mail server saved on the page may have", () => {
  it.each(REFUSED)("refuses %s (%s)", (ip) => expect(privateAddress(ip)).toBe(true));
  it.each(ALLOWED)("allows %s (%s)", (ip) => expect(privateAddress(ip)).toBe(false));

  it("finds the IPv4 address inside IPv6", () => {
    expect(innerIPv4("::ffff:10.1.2.3")).toBe("10.1.2.3");
    expect(innerIPv4("::ffff:0:a01:203")).toBe("10.1.2.3");
    expect(innerIPv4("::a01:203")).toBe("10.1.2.3");
    expect(innerIPv4("64:ff9b::a01:203")).toBe("10.1.2.3");
    expect(innerIPv4("2002:a01:203::")).toBe("10.1.2.3");
    expect(innerIPv4("2606:4700::1")).toBeNull();
    expect(innerIPv4("10.1.2.3")).toBeNull();
  });

  it("judges names as written: bare names and .localhost are inside, other names wait for their addresses", () => {
    for (const host of ["mail", "localhost", "relay.localhost", "LOCALHOST.", "10.0.0.1", "[::1]"]) expect(privateMailHost(host), host).toBe(true);
    for (const host of ["smtp.example.com", "93.184.216.34", "[2606:4700:4700::1111]"]) expect(privateMailHost(host), host).toBe(false);
  });
});
