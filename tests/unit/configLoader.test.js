const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { loadConfig } = require('../../src/core/configLoader');
const { ConfigError } = require('../../src/utils/errors');

describe('Config Loader Unit Tests', () => {
  it('loads scenario-basic successfully', () => {
    const basicPath = path.resolve(__dirname, '../../config/scenario-basic');
    const config = loadConfig(basicPath);

    assert.ok(config);
    assert.strictEqual(config.scenarioName, 'scenario-basic');
    assert.ok(config.dns['api.example.com']);
    assert.strictEqual(config.dns['api.example.com'].type, 'A');
    assert.strictEqual(config.dns['api.example.com'].value, '10.0.1.50');
    assert.ok(config.routes.length >= 2);
    assert.ok(config.firewall.length >= 2);
    assert.ok(Object.isFrozen(config));
  });

  it('loads scenario-complex successfully', () => {
    const complexPath = path.resolve(__dirname, '../../config/scenario-complex');
    const config = loadConfig(complexPath);

    assert.ok(config);
    assert.strictEqual(config.scenarioName, 'scenario-complex');
    assert.ok(config.dns['portal.corp.net']);
    assert.strictEqual(config.dns['portal.corp.net'].type, 'CNAME');
    assert.ok(config.routes.length >= 4);
    assert.ok(config.firewall.length >= 4);
  });

  it('fails fast when CONFIG_PATH is missing or empty', () => {
    assert.throws(() => loadConfig(''), ConfigError);
    assert.throws(() => loadConfig('   '), ConfigError);
    assert.throws(() => loadConfig(undefined), ConfigError);
  });

  it('fails fast when configuration directory does not exist', () => {
    assert.throws(
      () => loadConfig('non/existent/path/for/sure'),
      ConfigError
    );
  });

  it('fails fast when any required file is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-cfg-missing-'));
    fs.writeFileSync(path.join(tmpDir, 'dns.json'), '{}');
    // routes.json missing
    fs.writeFileSync(path.join(tmpDir, 'firewall.json'), '[]');

    assert.throws(() => loadConfig(tmpDir), ConfigError);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fails fast when JSON is malformed', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-cfg-malformed-'));
    fs.writeFileSync(path.join(tmpDir, 'dns.json'), '{ "bad": json }');
    fs.writeFileSync(path.join(tmpDir, 'routes.json'), '[]');
    fs.writeFileSync(path.join(tmpDir, 'firewall.json'), '[]');

    assert.throws(() => loadConfig(tmpDir), ConfigError);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fails fast when schema validation fails (invalid CIDR or bad action)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-cfg-invalid-'));
    fs.writeFileSync(path.join(tmpDir, 'dns.json'), '{}');
    // invalid CIDR
    fs.writeFileSync(path.join(tmpDir, 'routes.json'), JSON.stringify([
      { destination_cidr: 'not-a-cidr', next_hop: '192.168.1.1', interface: 'eth0' }
    ]));
    fs.writeFileSync(path.join(tmpDir, 'firewall.json'), '[]');

    assert.throws(() => loadConfig(tmpDir), ConfigError);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
