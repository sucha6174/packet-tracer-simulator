/**
 * Network and IPv4 / CIDR manipulation utilities.
 */

/**
 * Checks if a string is a strictly valid IPv4 address in dot-decimal notation.
 * Prevents leading zeroes (except single 0) and values outside 0-255.
 * @param {string} ip
 * @returns {boolean}
 */
function isValidIPv4(ip) {
  if (typeof ip !== 'string') return false;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;

  for (let i = 0; i < 4; i++) {
    const part = parts[i];
    if (!/^\d+$/.test(part)) return false;
    // Disallow leading zeroes like "01" or "001"
    if (part.length > 1 && part.startsWith('0')) return false;
    const num = Number(part);
    if (num < 0 || num > 255) return false;
  }
  return true;
}

/**
 * Validates a hostname according to RFC 1123.
 * @param {string} hostname
 * @returns {boolean}
 */
function isValidHostname(hostname) {
  if (typeof hostname !== 'string') return false;
  const trimmed = hostname.trim().replace(/\.$/, '');
  if (trimmed.length === 0 || trimmed.length > 253) return false;

  const labels = trimmed.split('.');
  // Must have valid labels
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return false;
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)) {
      return false;
    }
  }
  return true;
}

/**
 * Normalizes a hostname (lowercase, stripped trailing dot).
 * @param {string} hostname
 * @returns {string}
 */
function normalizeHostname(hostname) {
  if (typeof hostname !== 'string') return '';
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Converts an IPv4 string to an unsigned 32-bit integer.
 * @param {string} ip
 * @returns {number}
 */
function ipToUInt32(ip) {
  if (!isValidIPv4(ip)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  const octets = ip.trim().split('.').map(Number);
  return (((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0);
}

/**
 * Converts an unsigned 32-bit integer back to an IPv4 string.
 * @param {number} uint32
 * @returns {string}
 */
function uInt32ToIp(uint32) {
  return [
    (uint32 >>> 24) & 255,
    (uint32 >>> 16) & 255,
    (uint32 >>> 8) & 255,
    uint32 & 255
  ].join('.');
}

/**
 * Computes the 32-bit subnet mask for a prefix length (0-32).
 * @param {number} prefixLength
 * @returns {number}
 */
function prefixToMask(prefixLength) {
  if (prefixLength === 0) return 0;
  if (prefixLength === 32) return 0xFFFFFFFF >>> 0;
  return ((0xFFFFFFFF << (32 - prefixLength)) >>> 0);
}

/**
 * Validates a CIDR string (e.g., "192.168.1.0/24").
 * @param {string} cidr
 * @returns {boolean}
 */
function isValidCIDR(cidr) {
  if (typeof cidr !== 'string') return false;
  const parts = cidr.trim().split('/');
  if (parts.length !== 2) return false;

  const [ipPart, prefixPart] = parts;
  if (!isValidIPv4(ipPart)) return false;
  if (!/^\d+$/.test(prefixPart)) return false;

  const prefix = Number(prefixPart);
  return prefix >= 0 && prefix <= 32;
}

/**
 * Parses a CIDR string into its components.
 * @param {string} cidr
 * @returns {{ baseIp: string, prefixLength: number, mask: number, networkInt: number, networkAddress: string }}
 */
function parseCIDR(cidr) {
  if (!isValidCIDR(cidr)) {
    throw new Error(`Invalid CIDR notation: ${cidr}`);
  }
  const [baseIp, prefixStr] = cidr.trim().split('/');
  const prefixLength = Number(prefixStr);
  const mask = prefixToMask(prefixLength);
  const baseInt = ipToUInt32(baseIp);
  const networkInt = (baseInt & mask) >>> 0;
  const networkAddress = uInt32ToIp(networkInt);

  return {
    baseIp,
    prefixLength,
    mask,
    networkInt,
    networkAddress
  };
}

/**
 * Checks whether an IPv4 address falls within a given CIDR block.
 * @param {string} ip
 * @param {string} cidr
 * @returns {boolean}
 */
function isIPInCIDR(ip, cidr) {
  if (!isValidIPv4(ip) || !isValidCIDR(cidr)) {
    return false;
  }
  const ipInt = ipToUInt32(ip);
  const parsed = parseCIDR(cidr);
  return ((ipInt & parsed.mask) >>> 0) === parsed.networkInt;
}

module.exports = {
  isValidIPv4,
  isValidHostname,
  normalizeHostname,
  ipToUInt32,
  uInt32ToIp,
  prefixToMask,
  isValidCIDR,
  parseCIDR,
  isIPInCIDR
};
