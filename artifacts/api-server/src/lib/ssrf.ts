/**
 * SSRF prevention utilities.
 *
 * Validates caller-supplied URLs before the server makes outbound requests.
 * Blocks loopback, private, link-local, and cloud-metadata addresses at both
 * the hostname-string level and after DNS resolution, so that attacker-
 * controlled domains that point to private IPs are also rejected.
 */

import dns from "node:dns/promises";

const PRIVATE_IPV4_PATTERNS: RegExp[] = [
  /^127\./,                                      // loopback
  /^0\.0\.0\.0$/,                                // unspecified
  /^10\./,                                       // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./,                 // RFC 1918
  /^192\.168\./,                                 // RFC 1918
  /^169\.254\./,                                 // link-local / metadata
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGNAT (RFC 6598)
  /^198\.51\.100\./,                             // TEST-NET-2
  /^203\.0\.113\./,                              // TEST-NET-3
  /^240\./,                                      // reserved
  /^255\.255\.255\.255$/,                        // broadcast
];

const PRIVATE_IPV6_PATTERNS: RegExp[] = [
  /^::1$/,                                       // loopback
  /^::/,                                         // unspecified
  /^fe[89ab][0-9a-f]:/i,                         // link-local fe80::/10
  /^fc[0-9a-f]{2}:/i,                            // unique local fc00::/7
  /^fd[0-9a-f]{2}:/i,                            // unique local fd00::/8
  /^64:ff9b::/i,                                 // IPv4-mapped translation
  /^::ffff:/i,                                   // IPv4-mapped
];

function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_IPV4_PATTERNS.some((p) => p.test(ip));
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");
  return PRIVATE_IPV6_PATTERNS.some((p) => p.test(normalized));
}

function isPrivateIp(ip: string): boolean {
  return ip.includes(":") ? isPrivateIpv6(ip) : isPrivateIpv4(ip);
}

type ValidUrl = { valid: true; url: URL };
type InvalidUrl = { valid: false; reason: string };

/**
 * Validate that a caller-supplied URL is safe to fetch from the server.
 *
 * Checks:
 * 1. Must be a valid URL with http or https scheme.
 * 2. Hostname string must not be a known private/loopback/metadata literal.
 * 3. All DNS A/AAAA records for the hostname must resolve to public IPs.
 *
 * Step 3 catches domains that look public but resolve to internal hosts.
 */
export async function validateSafeUrl(rawUrl: string): Promise<ValidUrl | InvalidUrl> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: "Invalid URL" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { valid: false, reason: "Only http and https schemes are allowed" };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Fast-reject known private IP literals before going to DNS
  if (isPrivateIp(hostname) || hostname === "localhost") {
    return { valid: false, reason: "URL targets a reserved or private address" };
  }

  // Resolve the hostname and reject if any address is private
  try {
    const records = await dns.lookup(hostname, { all: true, family: 0 });
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        return { valid: false, reason: "URL hostname resolves to a private or reserved address" };
      }
    }
  } catch {
    return { valid: false, reason: "URL hostname could not be resolved" };
  }

  return { valid: true, url: parsed };
}
