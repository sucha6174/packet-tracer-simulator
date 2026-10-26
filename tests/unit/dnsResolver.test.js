const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DNSResolver } = require('../../src/components/dnsResolver');

describe('DNS Resolver Unit Tests', () => {
  const sampleRecords = {
    'example.com': { type: 'A', value: '10.0.1.50' },
    'web.example.com': { type: 'A', value: '10.0.1.80' },
    'www.example.com': { type: 'CNAME', value: 'web.example.com' },
    'portal.corp.net': { type: 'CNAME', value: 'app.corp.net' },
    'app.corp.net': { type: 'CNAME', value: 'origin.corp.net' },
    'origin.corp.net': { type: 'A', value: '172.16.20.100' }
  };

  it('skips DNS when destination is already an IPv4 address', () => {
    const resolver = new DNSResolver(sampleRecords);
    const result = resolver.resolve('192.168.1.1');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.ip, '192.168.1.1');
    assert.strictEqual(result.events.length, 0);
  });

  it('successfully resolves direct A record', () => {
    const resolver = new DNSResolver(sampleRecords);
    const result = resolver.resolve('example.com');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.ip, '10.0.1.50');
    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0].component, 'DNS');
    assert.match(result.events[0].action, /Resolved example\.com to 10\.0\.1\.50/);
  });

  it('successfully resolves single-level CNAME record', () => {
    const resolver = new DNSResolver(sampleRecords);
    const result = resolver.resolve('www.example.com');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.ip, '10.0.1.80');
    assert.strictEqual(result.events.length, 2);
    assert.match(result.events[0].action, /CNAME lookup/);
    assert.match(result.events[1].action, /Resolved www\.example\.com/);
  });

  it('successfully resolves multi-level CNAME chain', () => {
    const resolver = new DNSResolver(sampleRecords);
    const result = resolver.resolve('portal.corp.net');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.ip, '172.16.20.100');
    assert.strictEqual(result.events.length, 3); // 2 CNAME lookups + 1 final resolution
  });

  it('handles case-insensitivity and trailing dots', () => {
    const resolver = new DNSResolver(sampleRecords);
    const result = resolver.resolve('EXAMPLE.COM.');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.ip, '10.0.1.50');
  });

  it('returns NXDOMAIN for unknown hostname', () => {
    const resolver = new DNSResolver(sampleRecords);
    const result = resolver.resolve('nonexistent-domain.org');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'NXDOMAIN');
    assert.strictEqual(result.events.length, 1);
    assert.match(result.events[0].action, /NXDOMAIN/);
  });

  it('detects direct circular CNAME loop', () => {
    const loopRecords = {
      'loop.com': { type: 'CNAME', value: 'loop.com' }
    };
    const resolver = new DNSResolver(loopRecords);
    const result = resolver.resolve('loop.com');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'CNAME_LOOP');
    assert.match(result.events[result.events.length - 1].action, /loop detected/i);
  });

  it('detects multi-hop CNAME loop (a -> b -> c -> a)', () => {
    const loopRecords = {
      'a.com': { type: 'CNAME', value: 'b.com' },
      'b.com': { type: 'CNAME', value: 'c.com' },
      'c.com': { type: 'CNAME', value: 'a.com' }
    };
    const resolver = new DNSResolver(loopRecords);
    const result = resolver.resolve('a.com');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'CNAME_LOOP');
    assert.match(result.events[result.events.length - 1].action, /loop detected/i);
  });

  it('enforces maximum recursion depth limit', () => {
    // Chain of 7 hops
    const deepRecords = {
      'h1.com': { type: 'CNAME', value: 'h2.com' },
      'h2.com': { type: 'CNAME', value: 'h3.com' },
      'h3.com': { type: 'CNAME', value: 'h4.com' },
      'h4.com': { type: 'CNAME', value: 'h5.com' },
      'h5.com': { type: 'CNAME', value: 'h6.com' },
      'h6.com': { type: 'CNAME', value: 'h7.com' },
      'h7.com': { type: 'A', value: '1.2.3.4' }
    };
    const resolver = new DNSResolver(deepRecords, 5);
    const result = resolver.resolve('h1.com');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'RECURSION_LIMIT_EXCEEDED');
    assert.match(result.events[result.events.length - 1].action, /recursion limit exceeded/i);
  });
});
