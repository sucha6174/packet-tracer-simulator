const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createApp } = require('../../src/app');
const { loadConfig } = require('../../src/core/configLoader');
const { createTestClient } = require('../helpers/testClient');

describe('API Integration Tests', () => {
  let clientBasic;
  let clientComplex;

  before(() => {
    const basicConfig = loadConfig(path.resolve(__dirname, '../../config/scenario-basic'));
    const complexConfig = loadConfig(path.resolve(__dirname, '../../config/scenario-complex'));
    const appBasic = createApp(basicConfig);
    const appComplex = createApp(complexConfig);
    clientBasic = createTestClient(appBasic);
    clientComplex = createTestClient(appComplex);
  });

  describe('GET /health', () => {
    it('returns 200 OK and scenario status for basic scenario', async () => {
      const res = await clientBasic.get('/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'healthy');
      assert.strictEqual(res.body.scenario, 'scenario-basic');
      assert.strictEqual(typeof res.body.routes_count, 'number');
      assert.strictEqual(typeof res.body.dns_records_count, 'number');
      assert.strictEqual(typeof res.body.firewall_rules_count, 'number');
    });

    it('returns 200 OK and scenario status for complex scenario', async () => {
      const res = await clientComplex.get('/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'healthy');
      assert.strictEqual(res.body.scenario, 'scenario-complex');
    });
  });

  describe('POST /trace - Happy Path and Forwarding', () => {
    it('Case 1: Valid packet successfully resolved, routed, allowed, and forwarded', async () => {
      const payload = {
        source_ip: '192.168.1.100',
        destination: 'api.example.com',
        destination_port: 443,
        protocol: 'TCP',
        initial_ttl: 5
      };

      const res = await clientBasic.post('/trace').send(payload);

      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.trace));
      const trace = res.body.trace;

      // Ensure sequential steps starting at 1
      trace.forEach((evt, idx) => {
        assert.strictEqual(evt.step, idx + 1);
        assert.ok(evt.component);
        assert.ok(evt.action);
      });

      // Step 1: DNS
      assert.strictEqual(trace[0].component, 'DNS');
      assert.match(trace[0].action, /Resolved api\.example\.com to 10\.0\.1\.50/);

      // Step 2: Router
      assert.strictEqual(trace[1].component, 'Router');
      assert.match(trace[1].action, /Route matched/);
      assert.match(trace[1].action, /Decremented TTL to 4/);

      // Step 3: Firewall
      assert.strictEqual(trace[2].component, 'Firewall');
      assert.match(trace[2].action, /Packet allowed/);

      // Step 4: Final Forwarding
      assert.strictEqual(trace[3].component, 'Router');
      assert.match(trace[3].action, /Packet forwarded to next hop 192\.168\.1\.1 via interface eth1/);
    });

    it('Case 2: Direct IPv4 destination skips DNS entirely', async () => {
      const payload = {
        source_ip: '192.168.1.100',
        destination: '10.0.1.50',
        destination_port: 80,
        protocol: 'TCP',
        initial_ttl: 4
      };

      const res = await clientBasic.post('/trace').send(payload);

      assert.strictEqual(res.status, 200);
      const trace = res.body.trace;
      // No DNS step in trace
      assert.ok(!trace.some((e) => e.component === 'DNS'));
      assert.strictEqual(trace[0].step, 1);
      assert.strictEqual(trace[0].component, 'Router');
      assert.strictEqual(trace[trace.length - 1].component, 'Router');
      assert.match(trace[trace.length - 1].action, /Packet forwarded/);
    });

    it('Case 4: Single-level CNAME resolution works end-to-end', async () => {
      const payload = {
        source_ip: '192.168.1.100',
        destination: 'www.example.com',
        destination_port: 80,
        protocol: 'TCP',
        initial_ttl: 5
      };

      const res = await clientBasic.post('/trace').send(payload);

      assert.strictEqual(res.status, 200);
      const trace = res.body.trace;
      assert.strictEqual(trace[0].component, 'DNS');
      assert.match(trace[0].action, /CNAME lookup/);
      assert.strictEqual(trace[1].component, 'DNS');
      assert.match(trace[1].action, /Resolved www\.example\.com/);
    });

    it('Case 5: Multi-level CNAME resolution in scenario-complex', async () => {
      const payload = {
        source_ip: '10.100.0.50',
        destination: 'portal.corp.net',
        destination_port: 443,
        protocol: 'TCP',
        initial_ttl: 10
      };

      const res = await clientComplex.post('/trace').send(payload);

      assert.strictEqual(res.status, 200);
      const trace = res.body.trace;
      // portal -> app -> origin (172.16.20.100)
      assert.match(trace[0].action, /portal\.corp\.net is an alias for app\.corp\.net/);
      assert.match(trace[1].action, /app\.corp\.net is an alias for origin\.corp\.net/);
      assert.match(trace[2].action, /Resolved portal\.corp\.net.*to 172\.16\.20\.100/);
      assert.match(trace[trace.length - 1].action, /Packet forwarded to next hop 172\.16\.20\.1 via interface eth-dmz-app/);
    });
  });

  describe('POST /trace - Failure Outcomes and Boundary Conditions', () => {
    it('Case 6: Unknown hostname produces NXDOMAIN and terminates trace without routing', async () => {
      const payload = {
        source_ip: '192.168.1.100',
        destination: 'unknown-domain.com',
        destination_port: 80,
        protocol: 'TCP',
        initial_ttl: 5
      };

      const res = await clientBasic.post('/trace').send(payload);

      assert.strictEqual(res.status, 200);
      const trace = res.body.trace;
      assert.strictEqual(trace.length, 1);
      assert.strictEqual(trace[0].component, 'DNS');
      assert.match(trace[0].action, /NXDOMAIN/);
    });

    it('Case 12: No route to host terminates trace without firewall evaluation', async () => {
      // In scenario-complex, 192.168.99.1 has no route because there is no default route
      const payload = {
        source_ip: '10.0.0.1',
        destination: '192.168.99.1',
        destination_port: 80,
        protocol: 'TCP',
        initial_ttl: 5
      };

      const res = await clientComplex.post('/trace').send(payload);

      assert.strictEqual(res.status, 200);
      const trace = res.body.trace;
      assert.strictEqual(trace.length, 1);
      assert.strictEqual(trace[0].component, 'Router');
      assert.match(trace[0].action, /No route to host/);
      // Ensure firewall was NOT evaluated
      assert.ok(!trace.some((e) => e.component === 'Firewall'));
    });

    it('Case 13: TTL of 1 expires before firewall evaluation', async () => {
      const payload = {
        source_ip: '192.168.1.100',
        destination: 'api.example.com',
        destination_port: 443,
        protocol: 'TCP',
        initial_ttl: 1
      };

      const res = await clientBasic.post('/trace').send(payload);

      assert.strictEqual(res.status, 200);
      const trace = res.body.trace;
      // Step 1: DNS resolved
      assert.strictEqual(trace[0].component, 'DNS');
      // Step 2: Route matched, TTL decremented to 0
      assert.strictEqual(trace[1].component, 'Router');
      assert.match(trace[1].action, /Decremented TTL to 0/);
      // Step 3: TTL exceeded
      assert.strictEqual(trace[2].component, 'Router');
      assert.match(trace[2].action, /Time to Live exceeded\. Packet dropped\./);
      // Total 3 steps, NO firewall step, NO forwarding
      assert.strictEqual(trace.length, 3);
      assert.ok(!trace.some((e) => e.component === 'Firewall'));
    });

    it('Case 14: TTL of 2 leaves positive TTL (1) and evaluates firewall', async () => {
      const payload = {
        source_ip: '192.168.1.100',
        destination: '10.0.1.50',
        destination_port: 80,
        protocol: 'TCP',
        initial_ttl: 2
      };

      const res = await clientBasic.post('/trace').send(payload);

      assert.strictEqual(res.status, 200);
      const trace = res.body.trace;
      assert.match(trace[0].action, /Decremented TTL to 1/);
      assert.strictEqual(trace[1].component, 'Firewall');
      assert.match(trace[2].action, /Packet forwarded/);
    });

    it('Case 16: Firewall deny rule stops forwarding', async () => {
      // In scenario-basic, SSH (port 22 TCP) is blocked by rule 1
      const payload = {
        source_ip: '192.168.1.100',
        destination: 'api.example.com',
        destination_port: 22,
        protocol: 'TCP',
        initial_ttl: 5
      };

      const res = await clientBasic.post('/trace').send(payload);

      assert.strictEqual(res.status, 200);
      const trace = res.body.trace;
      const lastEvent = trace[trace.length - 1];
      assert.strictEqual(lastEvent.component, 'Firewall');
      assert.match(lastEvent.action, /Packet denied by rule 1/);
      // Ensure NO forwarding event exists
      assert.ok(!trace.some((e) => e.action.includes('Packet forwarded')));
    });

    it('Case 19: Unmatched firewall traffic is denied by default policy', async () => {
      // Port 9999 is not allowed by any rule in scenario-basic
      const payload = {
        source_ip: '192.168.1.100',
        destination: 'api.example.com',
        destination_port: 9999,
        protocol: 'TCP',
        initial_ttl: 5
      };

      const res = await clientBasic.post('/trace').send(payload);

      assert.strictEqual(res.status, 200);
      const trace = res.body.trace;
      const lastEvent = trace[trace.length - 1];
      assert.strictEqual(lastEvent.component, 'Firewall');
      assert.match(lastEvent.action, /denied by default policy/);
    });
  });

  describe('Longest Prefix Match Integration in scenario-complex', () => {
    it('Case 9: Selects /32 host route over /24, /16, and /8', async () => {
      const payload = {
        source_ip: '10.100.0.50',
        destination: '10.1.2.50',
        destination_port: 443,
        protocol: 'TCP',
        initial_ttl: 5
      };

      const res = await clientComplex.post('/trace').send(payload);

      assert.strictEqual(res.status, 200);
      const trace = res.body.trace;
      assert.match(trace[0].action, /10\.1\.2\.50\/32/);
      assert.match(trace[0].action, /eth-host-direct/);
    });

    it('Selects /24 subnet route for 10.1.2.99', async () => {
      const payload = {
        source_ip: '10.100.0.50',
        destination: '10.1.2.99',
        destination_port: 443,
        protocol: 'TCP',
        initial_ttl: 5
      };

      const res = await clientComplex.post('/trace').send(payload);

      assert.strictEqual(res.status, 200);
      const trace = res.body.trace;
      assert.match(trace[0].action, /10\.1\.2\.0\/24/);
      assert.match(trace[0].action, /eth-lan/);
    });
  });

  describe('HTTP Validation and Error Handling', () => {
    it('Case 20: Missing required field returns HTTP 400 Bad Request', async () => {
      const res = await clientBasic.post('/trace').send({
        source_ip: '192.168.1.100',
        destination: 'api.example.com',
        // destination_port missing
        protocol: 'TCP',
        initial_ttl: 5
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'Bad Request');
      assert.ok(res.body.message.includes('destination_port'));
    });

    it('Returns HTTP 400 for negative TTL or invalid port', async () => {
      const res1 = await clientBasic.post('/trace').send({
        source_ip: '192.168.1.100',
        destination: 'api.example.com',
        destination_port: 0,
        protocol: 'TCP',
        initial_ttl: 5
      });
      assert.strictEqual(res1.status, 400);

      const res2 = await clientBasic.post('/trace').send({
        source_ip: '192.168.1.100',
        destination: 'api.example.com',
        destination_port: 80,
        protocol: 'TCP',
        initial_ttl: -1
      });
      assert.strictEqual(res2.status, 400);
    });

    it('Case 21: Malformed JSON returns HTTP 400 Bad Request', async () => {
      const res = await clientBasic
        .post('/trace')
        .set('Content-Type', 'application/json')
        .send('{ "source_ip": "192.168.1.100", malformed_json }');

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'Bad Request');
      assert.match(res.body.message, /Malformed JSON/);
    });

    it('Returns 404 for unknown endpoint', async () => {
      const res = await clientBasic.get('/unknown-endpoint');
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.error, 'Not Found');
    });
  });
});
