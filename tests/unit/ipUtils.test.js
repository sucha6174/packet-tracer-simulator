const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidIPv4,
  isValidHostname,
  normalizeHostname,
  ipToUInt32,
  uInt32ToIp,
  prefixToMask,
  isValidCIDR,
  parseCIDR,
  isIPInCIDR
} = require('../../src/utils/ipUtils');

describe('IP and CIDR Utilities', () => {
  describe('isValidIPv4', () => {
    it('accepts standard IPv4 addresses', () => {
      assert.strictEqual(isValidIPv4('192.168.1.1'), true);
      assert.strictEqual(isValidIPv4('10.0.0.1'), true);
      assert.strictEqual(isValidIPv4('0.0.0.0'), true);
      assert.strictEqual(isValidIPv4('255.255.255.255'), true);
    });

    it('rejects invalid octets and non-IPv4 strings', () => {
      assert.strictEqual(isValidIPv4('256.0.0.1'), false);
      assert.strictEqual(isValidIPv4('192.168.1'), false);
      assert.strictEqual(isValidIPv4('192.168.1.1.1'), false);
      assert.strictEqual(isValidIPv4('192.168.01.1'), false); // leading zero rejected
      assert.strictEqual(isValidIPv4('192.168.1.a'), false);
      assert.strictEqual(isValidIPv4(''), false);
      assert.strictEqual(isValidIPv4(null), false);
      assert.strictEqual(isValidIPv4(undefined), false);
      assert.strictEqual(isValidIPv4('example.com'), false);
    });
  });

  describe('isValidHostname and normalizeHostname', () => {
    it('accepts standard hostnames', () => {
      assert.strictEqual(isValidHostname('example.com'), true);
      assert.strictEqual(isValidHostname('api.example.com'), true);
      assert.strictEqual(isValidHostname('my-sub.domain.co.uk'), true);
      assert.strictEqual(isValidHostname('host123.local'), true);
      assert.strictEqual(isValidHostname('example.com.'), true); // trailing dot allowed before normalization
    });

    it('rejects invalid hostnames', () => {
      assert.strictEqual(isValidHostname('-bad.com'), false);
      assert.strictEqual(isValidHostname('bad-.com'), false);
      assert.strictEqual(isValidHostname(''), false);
      assert.strictEqual(isValidHostname('a'.repeat(255)), false);
      assert.strictEqual(isValidHostname(null), false);
    });

    it('normalizes hostnames', () => {
      assert.strictEqual(normalizeHostname('API.Example.COM.'), 'api.example.com');
      assert.strictEqual(normalizeHostname('   Web.Site   '), 'web.site');
    });
  });

  describe('ipToUInt32 and uInt32ToIp', () => {
    it('converts IPv4 to 32-bit unsigned integer and back', () => {
      const ips = ['0.0.0.0', '192.168.1.1', '10.0.1.50', '255.255.255.255'];
      for (const ip of ips) {
        const uint = ipToUInt32(ip);
        assert.ok(uint >= 0 && uint <= 4294967295);
        assert.strictEqual(uInt32ToIp(uint), ip);
      }
    });

    it('throws on invalid IP conversion', () => {
      assert.throws(() => ipToUInt32('999.0.0.1'), /Invalid IPv4 address/);
    });
  });

  describe('prefixToMask and parseCIDR', () => {
    it('calculates correct subnet masks for prefix lengths', () => {
      assert.strictEqual(prefixToMask(0), 0);
      assert.strictEqual(uInt32ToIp(prefixToMask(8)), '255.0.0.0');
      assert.strictEqual(uInt32ToIp(prefixToMask(16)), '255.255.0.0');
      assert.strictEqual(uInt32ToIp(prefixToMask(24)), '255.255.255.0');
      assert.strictEqual(uInt32ToIp(prefixToMask(32)), '255.255.255.255');
    });

    it('parses CIDR notations correctly', () => {
      const parsed = parseCIDR('10.1.2.50/24');
      assert.strictEqual(parsed.prefixLength, 24);
      assert.strictEqual(parsed.networkAddress, '10.1.2.0');
    });
  });

  describe('isIPInCIDR', () => {
    it('accurately tests whether IP is inside a CIDR block', () => {
      assert.strictEqual(isIPInCIDR('10.1.2.50', '10.1.2.0/24'), true);
      assert.strictEqual(isIPInCIDR('10.1.2.254', '10.1.2.0/24'), true);
      assert.strictEqual(isIPInCIDR('10.1.3.1', '10.1.2.0/24'), false);

      // Default route matches all valid IPs
      assert.strictEqual(isIPInCIDR('1.2.3.4', '0.0.0.0/0'), true);
      assert.strictEqual(isIPInCIDR('192.168.1.1', '0.0.0.0/0'), true);

      // /32 single host
      assert.strictEqual(isIPInCIDR('192.168.1.10', '192.168.1.10/32'), true);
      assert.strictEqual(isIPInCIDR('192.168.1.11', '192.168.1.10/32'), false);
    });

    it('returns false for invalid inputs', () => {
      assert.strictEqual(isIPInCIDR('invalid-ip', '10.0.0.0/8'), false);
      assert.strictEqual(isIPInCIDR('10.0.0.1', 'invalid-cidr'), false);
    });
  });
});
