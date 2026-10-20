import ipaddr from 'ipaddr.js';

/** Why an address is blocked, for logs only. The client always gets `unreachable` (E-2). */
export type IpVerdict = { allowed: true } | { allowed: false; reason: string };

const GLOBAL_UNICAST = ipaddr.parseCIDR('2000::/3');
const IETF_PROTOCOL = ipaddr.parseCIDR('2001::/23');

function v4Verdict(ip: ipaddr.IPv4, form = 'IPv4'): IpVerdict {
  const range = ip.range();
  return range === 'unicast' ? { allowed: true } : { allowed: false, reason: `${form} ${range}` };
}

function v4FromParts(hi: number, lo: number): ipaddr.IPv4 {
  return new ipaddr.IPv4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
}

function v6Verdict(ip: ipaddr.IPv6): IpVerdict {
  const range = ip.range();
  const p = ip.parts;
  switch (range) {
    case 'ipv4Mapped':
      return v4Verdict(ip.toIPv4Address(), 'IPv4-mapped');
    case 'rfc6145':
      return v4Verdict(v4FromParts(p[6]!, p[7]!), 'IPv4-translated');
    case '6to4':
      return v4Verdict(v4FromParts(p[1]!, p[2]!), '6to4');
    case 'teredo': {
      const server = v4Verdict(v4FromParts(p[2]!, p[3]!), 'Teredo server');
      if (!server.allowed) return server;
      return v4Verdict(v4FromParts(~p[6]! & 0xffff, ~p[7]! & 0xffff), 'Teredo client');
    }
    case 'unicast':
      if (!ip.match(GLOBAL_UNICAST)) return { allowed: false, reason: 'IPv6 outside 2000::/3' };
      if (ip.match(IETF_PROTOCOL)) return { allowed: false, reason: 'IPv6 IETF protocol range' };
      return { allowed: true };
    default:
      return { allowed: false, reason: `IPv6 ${range}` };
  }
}

/**
 * SEC-2: only global unicast addresses pass. Loopback, private, link-local (incl. 169.254.169.254),
 * CGNAT, unspecified, broadcast, multicast, reserved and documentation ranges, ULA, NAT64 and
 * every embedded-IPv4 form of a blocked IPv4 address are rejected. Unparseable input is rejected.
 */
export function checkAddress(address: string): IpVerdict {
  const raw = address.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  // Strict forms only. Resolvers and the WHATWG URL parser emit canonical addresses, so anything
  // else (legacy "1.1.1", hex or octal parts) fails closed.
  if (ipaddr.IPv4.isValidFourPartDecimal(raw)) return v4Verdict(ipaddr.IPv4.parse(raw));
  if (ipaddr.IPv6.isValid(raw)) return v6Verdict(ipaddr.IPv6.parse(raw));
  return { allowed: false, reason: 'not an IP address' };
}

export function isPublicAddress(address: string): boolean {
  return checkAddress(address).allowed;
}
