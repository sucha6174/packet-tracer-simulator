const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Router } = require('../../src/components/router');

describe('Routing Engine Unit Tests', () => {
  const routes = [
    { destination_cidr: '10.0.0.0/8', next_hop: '10.0.0.1', interface: 'eth-backbone' },
    { destination_cidr: '10.1.0.0/16', next_hop: '10.1.0.1', interface: 'eth-regional' },
    { destination_cidr: '10.1.2.0/24', next_hop: '10.1.2.1', interface: 'eth-lan' },
    { destination_cidr: '10.1.2.50/32', next_hop: '10.1.2.50', interface: 'eth-host-direct' },
    { destination_cidr: '0.0.0.0/0', next_hop: '192.168.1.254', interface: 'eth-gateway' }
  ];

  it('selects the most specific route via Longest Prefix Match (/32 beats /24, /16, /8, /0)', () => {
    const router = new Router(routes);
    const bestRoute = router.findBestRoute('10.1.2.50');

    assert.ok(bestRoute);
    assert.strictEqual(bestRoute.destination_cidr, '10.1.2.50/32');
    assert.strictEqual(bestRoute.prefixLength, 32);
    assert.strictEqual(bestRoute.interface, 'eth-host-direct');
  });

  it('selects /24 when /32 does not match', () => {
    const router = new Router(routes);
    const bestRoute = router.findBestRoute('10.1.2.99');

    assert.ok(bestRoute);
    assert.strictEqual(bestRoute.destination_cidr, '10.1.2.0/24');
    assert.strictEqual(bestRoute.prefixLength, 24);
    assert.strictEqual(bestRoute.interface, 'eth-lan');
  });

  it('selects /16 when /24 does not match', () => {
    const router = new Router(routes);
    const bestRoute = router.findBestRoute('10.1.5.10');

    assert.ok(bestRoute);
    assert.strictEqual(bestRoute.destination_cidr, '10.1.0.0/16');
    assert.strictEqual(bestRoute.prefixLength, 16);
    assert.strictEqual(bestRoute.interface, 'eth-regional');
  });

  it('selects /8 when /16 does not match', () => {
    const router = new Router(routes);
    const bestRoute = router.findBestRoute('10.99.1.1');

    assert.ok(bestRoute);
    assert.strictEqual(bestRoute.destination_cidr, '10.0.0.0/8');
    assert.strictEqual(bestRoute.prefixLength, 8);
    assert.strictEqual(bestRoute.interface, 'eth-backbone');
  });

  it('selects default route 0.0.0.0/0 when no specific route matches', () => {
    const router = new Router(routes);
    const bestRoute = router.findBestRoute('172.16.0.1');

    assert.ok(bestRoute);
    assert.strictEqual(bestRoute.destination_cidr, '0.0.0.0/0');
    assert.strictEqual(bestRoute.prefixLength, 0);
    assert.strictEqual(bestRoute.interface, 'eth-gateway');
  });

  it('LPM decisions are strictly order-independent', () => {
    // Reverse the route order
    const reversedRoutes = [...routes].reverse();
    const router1 = new Router(routes);
    const router2 = new Router(reversedRoutes);

    const testIps = ['10.1.2.50', '10.1.2.99', '10.1.5.10', '10.99.1.1', '8.8.8.8'];
    for (const ip of testIps) {
      const r1 = router1.findBestRoute(ip);
      const r2 = router2.findBestRoute(ip);
      assert.strictEqual(r1.destination_cidr, r2.destination_cidr, `Mismatch for ${ip}`);
      assert.strictEqual(r1.prefixLength, r2.prefixLength, `Mismatch for ${ip}`);
      assert.strictEqual(r1.interface, r2.interface, `Mismatch for ${ip}`);
    }
  });

  it('returns No route to host when table has no default route and no match', () => {
    const restrictedRoutes = [
      { destination_cidr: '10.0.0.0/8', next_hop: '10.0.0.1', interface: 'eth0' }
    ];
    const router = new Router(restrictedRoutes);
    const result = router.processPacket('192.168.1.1', 5);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'NO_ROUTE');
    assert.strictEqual(result.events.length, 1);
    assert.match(result.events[0].action, /No route to host/);
  });

  it('decrements TTL by 1 and continues when TTL > 0', () => {
    const router = new Router(routes);
    const result = router.processPacket('10.1.2.50', 5);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.remainingTtl, 4);
    assert.strictEqual(result.events.length, 1);
    assert.match(result.events[0].action, /Decremented TTL to 4/);
  });

  it('drops packet when initial_ttl is 1 (decrements to 0 -> TTL Exceeded)', () => {
    const router = new Router(routes);
    const result = router.processPacket('10.1.2.50', 1);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'TTL_EXCEEDED');
    assert.strictEqual(result.remainingTtl, 0);
    assert.strictEqual(result.events.length, 2);
    assert.match(result.events[0].action, /Decremented TTL to 0/);
    assert.match(result.events[1].action, /Time to Live exceeded/);
  });
});
