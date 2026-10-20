import ipaddr from 'ipaddr.js';

/**
 * One form for blocklist entries, blocklist checks, cache keys and logs: lower case, IDNA to
 * ASCII (punycode via WHATWG URL), every trailing root dot removed. Empty labels are rejected.
 * IPv6 literals come back without brackets. Returns null for anything that is not a host.
 */
export function canonicalHost(host: string): string | null {
  let h = host.trim();
  if (!h || /[\s/?#@\\]/.test(h)) return null;
  const bare = h.replace(/^\[|\]$/g, '');
  if (ipaddr.IPv6.isValid(bare)) return ipaddr.IPv6.parse(bare).toString();
  try {
    h = new URL(`http://${h}/`).hostname;
  } catch {
    return null;
  }
  h = h.replace(/\.+$/, '');
  if (!h || h.split('.').some((label) => label === '')) return null;
  return h;
}

/** The host and every parent domain: a.b.c gives [a.b.c, b.c, c]. Used for suffix matching. */
export function hostSuffixes(host: string): string[] {
  const labels = host.split('.');
  return labels.map((_, i) => labels.slice(i).join('.'));
}

/** True when `host` equals `entry` or ends with `.` + `entry` (both canonical). */
export function matchesDomain(host: string, entry: string): boolean {
  return host === entry || host.endsWith(`.${entry}`);
}

export function isIpLiteral(host: string): boolean {
  return ipaddr.IPv4.isValidFourPartDecimal(host) || ipaddr.IPv6.isValid(host);
}
