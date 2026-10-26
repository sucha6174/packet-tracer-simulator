/**
 * Live HTTP server verification script.
 * Starts the actual HTTP server process and performs real HTTP requests against it.
 */

const { spawn } = require('child_process');
const http = require('http');

function post(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const parsedUrl = new URL(url);
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
  });
}

async function verifyScenarioBasic(port = 8089) {
  console.log(`\nTesting 'config/scenario-basic' on port ${port}...`);
  const serverProc = spawn('node', ['src/server.js'], {
    env: { ...process.env, CONFIG_PATH: 'config/scenario-basic', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', (d) => process.stdout.write(d.toString()));
  serverProc.stderr.on('data', (d) => process.stderr.write(d.toString()));

  await new Promise((r) => setTimeout(r, 1200));

  try {
    const health = await get(`http://127.0.0.1:${port}/health`);
    console.log('[GET /health]', health.status, health.body);

    const res1 = await post(`http://127.0.0.1:${port}/trace`, {
      source_ip: '192.168.1.100',
      destination: 'api.example.com',
      destination_port: 443,
      protocol: 'TCP',
      initial_ttl: 5
    });
    console.log('[POST /trace Happy Path]', res1.status, `Steps: ${res1.body.trace?.length}`);

    const res2 = await post(`http://127.0.0.1:${port}/trace`, {
      source_ip: '192.168.1.100',
      destination: 'not-found.domain.com',
      destination_port: 80,
      protocol: 'TCP',
      initial_ttl: 5
    });
    console.log('[POST /trace NXDOMAIN]', res2.status, res2.body.trace?.[0]?.action);

    const res3 = await post(`http://127.0.0.1:${port}/trace`, {
      source_ip: '192.168.1.100',
      destination: 'api.example.com',
      destination_port: 443,
      protocol: 'TCP',
      initial_ttl: 1
    });
    console.log('[POST /trace TTL 1]', res3.status, res3.body.trace?.[res3.body.trace.length - 1]?.action);

    const res4 = await post(`http://127.0.0.1:${port}/trace`, {
      source_ip: '192.168.1.100',
      destination: 'api.example.com',
      destination_port: 22,
      protocol: 'TCP',
      initial_ttl: 5
    });
    console.log('[POST /trace Firewall Block]', res4.status, res4.body.trace?.[res4.body.trace.length - 1]?.action);

    console.log(`[PASS] Scenario 'scenario-basic' verified successfully!`);
  } finally {
    serverProc.kill('SIGINT');
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function verifyScenarioComplex(port = 8090) {
  console.log(`\nTesting 'config/scenario-complex' on port ${port}...`);
  const serverProc = spawn('node', ['src/server.js'], {
    env: { ...process.env, CONFIG_PATH: 'config/scenario-complex', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', (d) => process.stdout.write(d.toString()));
  serverProc.stderr.on('data', (d) => process.stderr.write(d.toString()));

  await new Promise((r) => setTimeout(r, 1200));

  try {
    const health = await get(`http://127.0.0.1:${port}/health`);
    console.log('[GET /health]', health.status, health.body);

    // Test No Route to Host (destination 192.0.2.1)
    const resNoRoute = await post(`http://127.0.0.1:${port}/trace`, {
      source_ip: '10.0.0.1',
      destination: '192.0.2.1',
      destination_port: 80,
      protocol: 'TCP',
      initial_ttl: 5
    });
    console.log('[POST /trace No Route to Host]', resNoRoute.status, resNoRoute.body.trace?.[0]?.action);

    // Test LPM /32 vs /24 (destination 10.1.2.50)
    const resLPM = await post(`http://127.0.0.1:${port}/trace`, {
      source_ip: '10.100.0.50',
      destination: '10.1.2.50',
      destination_port: 443,
      protocol: 'TCP',
      initial_ttl: 8
    });
    console.log('[POST /trace LPM /32]', resLPM.status, resLPM.body.trace?.[0]?.action);

    // Test Multi-tier CNAME (destination portal.corp.net)
    const resCNAME = await post(`http://127.0.0.1:${port}/trace`, {
      source_ip: '10.100.0.50',
      destination: 'portal.corp.net',
      destination_port: 443,
      protocol: 'TCP',
      initial_ttl: 10
    });
    console.log('[POST /trace Multi-tier CNAME]', resCNAME.status, `Steps: ${resCNAME.body.trace?.length}`);

    console.log(`[PASS] Scenario 'scenario-complex' verified successfully!`);
  } finally {
    serverProc.kill('SIGINT');
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function run() {
  await verifyScenarioBasic(8089);
  await verifyScenarioComplex(8090);
  console.log('\nAll live server scenario tests passed successfully!');
}

run().catch((err) => {
  console.error('[FAILED]', err);
  process.exit(1);
});
