import { describe, expect, test } from 'vitest';
import { isPublicAddress } from '../src/net/ipPolicy.ts';

const BLOCKED: [string, string][] = [
  ['0.0.0.0', 'unspecified'],
  ['0.1.2.3', 'this network'],
  ['10.0.0.1', 'RFC 1918'],
  ['172.16.5.4', 'RFC 1918'],
  ['172.31.255.255', 'RFC 1918'],
  ['192.168.1.1', 'RFC 1918'],
  ['127.0.0.1', 'loopback'],
  ['127.255.0.9', 'loopback'],
  ['169.254.169.254', 'link-local metadata'],
  ['169.254.1.1', 'link-local'],
  ['100.64.0.1', 'CGNAT'],
  ['100.127.255.254', 'CGNAT'],
  ['192.0.0.8', 'IETF protocol'],
  ['192.0.2.10', 'TEST-NET-1'],
  ['198.51.100.7', 'TEST-NET-2'],
  ['203.0.113.9', 'TEST-NET-3'],
  ['198.18.0.1', 'benchmarking'],
  ['224.0.0.251', 'multicast'],
  ['239.255.255.250', 'multicast'],
  ['240.0.0.1', 'reserved'],
  ['255.255.255.255', 'broadcast'],
  ['::', 'IPv6 unspecified'],
  ['::1', 'IPv6 loopback'],
  ['fe80::1', 'IPv6 link-local'],
  ['fe80::1%eth0', 'IPv6 link-local with zone'],
  ['fc00::1', 'ULA'],
  ['fd12:3456::1', 'ULA'],
  ['fec0::1', 'site-local'],
  ['ff02::1', 'IPv6 multicast'],
  ['2001:db8::1', 'IPv6 documentation'],
  ['100::1', 'discard'],
  ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
  ['::ffff:10.0.0.1', 'IPv4-mapped private'],
  ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
  ['::127.0.0.1', 'IPv4-compatible loopback'],
  ['::ffff:0:7f00:1', 'IPv4-translated loopback'],
  ['64:ff9b::7f00:1', 'NAT64 of loopback'],
  ['64:ff9b::101:101', 'NAT64 of public'],
  ['64:ff9b:1::1', 'local NAT64'],
  ['2002:7f00:1::', '6to4 of loopback'],
  ['2002:a00:1::1', '6to4 of private'],
  ['2001:0:4136:e378:8000:63bf:80ff:fffe', 'Teredo of private client 127.0.0.1'],
  ['2001:2::1', 'IPv6 benchmarking'],
  ['2001:10::1', 'ORCHID'],
  ['2001:1::1', 'IETF protocol range'],
  ['3fff::1', 'IPv6 documentation 2'],
  ['5f00::1', 'segment routing'],
  ['[::1]', 'bracketed loopback'],
  ['localhost', 'hostname, not an IP'],
  ['1.1.1', 'malformed'],
  ['0x7f.0.0.1', 'hex form'],
  ['2130706433', 'integer form'],
];

const PUBLIC: [string, string][] = [
  ['1.1.1.1', 'Cloudflare DNS'],
  ['8.8.8.8', 'Google DNS'],
  ['93.184.215.14', 'public'],
  ['172.32.0.1', 'just outside 172.16/12'],
  ['100.128.0.1', 'just outside CGNAT'],
  ['2606:4700::1111', 'Cloudflare IPv6'],
  ['2001:4860:4860::8888', 'Google IPv6'],
  ['::ffff:1.1.1.1', 'IPv4-mapped public'],
  ['2002:101:101::1', '6to4 of public'],
];

describe('ipPolicy', () => {
  test.each(BLOCKED)('%s (%s) is blocked', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  test.each(PUBLIC)('%s (%s) is allowed', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});
