const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validatePacket } = require('../../src/core/packetValidator');
const { ValidationError } = require('../../src/utils/errors');

describe('Packet Validator Unit Tests', () => {
  const validPacket = {
    source_ip: '192.168.1.100',
    destination: 'api.example.com',
    destination_port: 443,
    protocol: 'TCP',
    initial_ttl: 5
  };

  it('validates and returns normalized packet for valid input', () => {
    const result = validatePacket(validPacket);
    assert.deepStrictEqual(result, {
      source_ip: '192.168.1.100',
      destination: 'api.example.com',
      destination_port: 443,
      protocol: 'TCP',
      initial_ttl: 5
    });
  });

  it('accepts valid direct IPv4 destination', () => {
    const result = validatePacket({
      ...validPacket,
      destination: '10.0.1.50'
    });
    assert.strictEqual(result.destination, '10.0.1.50');
  });

  it('normalizes protocol from lowercase to uppercase', () => {
    const resultTcp = validatePacket({ ...validPacket, protocol: 'tcp' });
    assert.strictEqual(resultTcp.protocol, 'TCP');

    const resultUdp = validatePacket({ ...validPacket, protocol: 'udp' });
    assert.strictEqual(resultUdp.protocol, 'UDP');
  });

  it('normalizes hostname to lowercase', () => {
    const result = validatePacket({ ...validPacket, destination: 'API.Example.COM.' });
    assert.strictEqual(result.destination, 'api.example.com');
  });

  it('accepts boundary ports 1 and 65535', () => {
    assert.strictEqual(validatePacket({ ...validPacket, destination_port: 1 }).destination_port, 1);
    assert.strictEqual(validatePacket({ ...validPacket, destination_port: 65535 }).destination_port, 65535);
  });

  it('accepts boundary initial_ttl of 1', () => {
    assert.strictEqual(validatePacket({ ...validPacket, initial_ttl: 1 }).initial_ttl, 1);
  });

  it('rejects missing or non-object payloads', () => {
    assert.throws(() => validatePacket(null), ValidationError);
    assert.throws(() => validatePacket(undefined), ValidationError);
    assert.throws(() => validatePacket([]), ValidationError);
    assert.throws(() => validatePacket('string'), ValidationError);
  });

  it('rejects missing required fields', () => {
    const fields = ['source_ip', 'destination', 'destination_port', 'protocol', 'initial_ttl'];
    for (const field of fields) {
      const copy = { ...validPacket };
      delete copy[field];
      assert.throws(() => validatePacket(copy), ValidationError, `Should reject missing ${field}`);
    }
  });

  it('rejects invalid source_ip addresses', () => {
    assert.throws(() => validatePacket({ ...validPacket, source_ip: '999.1.1.1' }), ValidationError);
    assert.throws(() => validatePacket({ ...validPacket, source_ip: '192.168.01.1' }), ValidationError);
    assert.throws(() => validatePacket({ ...validPacket, source_ip: 'not-an-ip' }), ValidationError);
  });

  it('rejects invalid destination', () => {
    assert.throws(() => validatePacket({ ...validPacket, destination: 'invalid..hostname' }), ValidationError);
    assert.throws(() => validatePacket({ ...validPacket, destination: '-bad.com' }), ValidationError);
  });

  it('rejects invalid ports: 0, negative, > 65535, or floats', () => {
    assert.throws(() => validatePacket({ ...validPacket, destination_port: 0 }), ValidationError);
    assert.throws(() => validatePacket({ ...validPacket, destination_port: -5 }), ValidationError);
    assert.throws(() => validatePacket({ ...validPacket, destination_port: 65536 }), ValidationError);
    assert.throws(() => validatePacket({ ...validPacket, destination_port: 80.5 }), ValidationError);
    assert.throws(() => validatePacket({ ...validPacket, destination_port: '80' }), ValidationError);
  });

  it('rejects unsupported protocols (e.g. ICMP, HTTP)', () => {
    assert.throws(() => validatePacket({ ...validPacket, protocol: 'ICMP' }), ValidationError);
    assert.throws(() => validatePacket({ ...validPacket, protocol: 'HTTP' }), ValidationError);
    assert.throws(() => validatePacket({ ...validPacket, protocol: '' }), ValidationError);
  });

  it('rejects invalid initial_ttl: 0, negative, float, string', () => {
    assert.throws(() => validatePacket({ ...validPacket, initial_ttl: 0 }), ValidationError);
    assert.throws(() => validatePacket({ ...validPacket, initial_ttl: -1 }), ValidationError);
    assert.throws(() => validatePacket({ ...validPacket, initial_ttl: 2.5 }), ValidationError);
    assert.throws(() => validatePacket({ ...validPacket, initial_ttl: '5' }), ValidationError);
  });
});
