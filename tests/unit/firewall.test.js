const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Firewall } = require('../../src/components/firewall');

describe('Firewall Unit Tests', () => {
  const rules = [
    {
      rule_id: 1,
      action: 'deny',
      source_cidr: '192.168.1.100/32',
      destination_port: 22,
      protocol: 'TCP'
    },
    {
      rule_id: 2,
      action: 'allow',
      source_cidr: '192.168.1.0/24',
      destination_port: 80,
      protocol: 'TCP'
    },
    {
      rule_id: 3,
      action: 'allow',
      source_cidr: '192.168.1.0/24',
      destination_port: 443,
      protocol: 'TCP'
    },
    {
      rule_id: 4,
      action: 'allow',
      source_cidr: '10.0.0.1/32',
      destination_port: '*',
      protocol: '*'
    },
    {
      rule_id: 5,
      action: 'deny',
      source_cidr: '0.0.0.0/0',
      destination_port: '*',
      protocol: 'UDP'
    }
  ];

  it('allows traffic matching an explicit allow rule', () => {
    const fw = new Firewall(rules);
    const result = fw.evaluate({
      source_ip: '192.168.1.50',
      destination_port: 80,
      protocol: 'TCP'
    });

    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.matchedRule.rule_id, 2);
    assert.strictEqual(result.events.length, 1);
    assert.match(result.events[0].action, /Packet allowed by rule 2/);
  });

  it('denies traffic matching an explicit deny rule', () => {
    const fw = new Firewall(rules);
    const result = fw.evaluate({
      source_ip: '192.168.1.100',
      destination_port: 22,
      protocol: 'TCP'
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.matchedRule.rule_id, 1);
    assert.strictEqual(result.events.length, 1);
    assert.match(result.events[0].action, /Packet denied by rule 1/);
  });

  it('enforces strict first-match evaluation', () => {
    // If a rule matches, later rules (even if also matching) are never evaluated
    const conflictingRules = [
      { rule_id: 'R1', action: 'allow', source_cidr: '0.0.0.0/0', destination_port: 80, protocol: 'TCP' },
      { rule_id: 'R2', action: 'deny', source_cidr: '0.0.0.0/0', destination_port: 80, protocol: 'TCP' }
    ];
    const fw1 = new Firewall(conflictingRules);
    const res1 = fw1.evaluate({ source_ip: '1.2.3.4', destination_port: 80, protocol: 'TCP' });
    assert.strictEqual(res1.allowed, true);
    assert.strictEqual(res1.matchedRule.rule_id, 'R1');

    const reversedRules = [...conflictingRules].reverse();
    const fw2 = new Firewall(reversedRules);
    const res2 = fw2.evaluate({ source_ip: '1.2.3.4', destination_port: 80, protocol: 'TCP' });
    assert.strictEqual(res2.allowed, false);
    assert.strictEqual(res2.matchedRule.rule_id, 'R2');
  });

  it('supports wildcard destination port (*)', () => {
    const fw = new Firewall(rules);
    const result = fw.evaluate({
      source_ip: '10.0.0.1',
      destination_port: 8080,
      protocol: 'TCP'
    });
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.matchedRule.rule_id, 4);
  });

  it('supports wildcard protocol (*)', () => {
    const fw = new Firewall(rules);
    const result = fw.evaluate({
      source_ip: '10.0.0.1',
      destination_port: 9000,
      protocol: 'UDP'
    });
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.matchedRule.rule_id, 4);
  });

  it('enforces default-deny when no rules match', () => {
    const fw = new Firewall(rules);
    // Port 8080 from 192.168.1.50 over TCP does not match rules 1, 2, 3, 4, 5
    const result = fw.evaluate({
      source_ip: '192.168.1.50',
      destination_port: 8080,
      protocol: 'TCP'
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.isDefaultDeny, true);
    assert.strictEqual(result.events.length, 1);
    assert.match(result.events[0].action, /Packet denied by default policy/);
  });
});
