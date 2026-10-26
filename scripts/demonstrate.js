/**
 * Demonstration script for Packet Tracer Simulator.
 * Runs the 5 core demonstration test cases plus advanced network scenarios,
 * printing clean logs and saving JSON results to screenshots/.
 */

const path = require('path');
const fs = require('fs');
const { loadConfig } = require('../src/core/configLoader');
const { NetworkSimulator } = require('../src/core/simulator');

const basicConfig = loadConfig(path.resolve(__dirname, '../config/scenario-basic'));
const complexConfig = loadConfig(path.resolve(__dirname, '../config/scenario-complex'));

const basicSim = new NetworkSimulator(basicConfig);
const complexSim = new NetworkSimulator(complexConfig);

const outputDir = path.resolve(__dirname, '../screenshots');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const testCases = [
  {
    id: '01_happy_path_success',
    title: 'Test Case 1: Successful Packet Tracing (Happy Path)',
    description: 'Packet with valid hostname, sufficient TTL, matching route, and allowed firewall rule.',
    simulator: basicSim,
    scenario: 'scenario-basic',
    input: {
      source_ip: '192.168.1.100',
      destination: 'api.example.com',
      destination_port: 443,
      protocol: 'TCP',
      initial_ttl: 5
    }
  },
  {
    id: '02_dns_failure_nxdomain',
    title: 'Test Case 2: DNS Failure (NXDOMAIN)',
    description: 'Packet with unresolvable domain terminates immediately at DNS resolver.',
    simulator: basicSim,
    scenario: 'scenario-basic',
    input: {
      source_ip: '192.168.1.100',
      destination: 'nonexistent-host.example.com',
      destination_port: 80,
      protocol: 'TCP',
      initial_ttl: 5
    }
  },
  {
    id: '03_routing_failure_no_route',
    title: 'Test Case 3: Routing Failure (No Route to Host)',
    description: 'Destination IP with no matching CIDR block in routing table terminates trace.',
    simulator: complexSim,
    scenario: 'scenario-complex',
    input: {
      source_ip: '10.0.0.1',
      destination: '192.0.2.1',
      destination_port: 80,
      protocol: 'TCP',
      initial_ttl: 5
    }
  },
  {
    id: '04_ttl_expiration',
    title: 'Test Case 4: TTL Expiration Boundary',
    description: 'Packet with initial_ttl = 1 decrements to 0 at router and drops before firewall.',
    simulator: basicSim,
    scenario: 'scenario-basic',
    input: {
      source_ip: '192.168.1.100',
      destination: 'api.example.com',
      destination_port: 443,
      protocol: 'TCP',
      initial_ttl: 1
    }
  },
  {
    id: '05_firewall_denial',
    title: 'Test Case 5: Firewall Explicit Denial',
    description: 'SSH packet (port 22) blocked by explicit deny rule 1 before forwarding.',
    simulator: basicSim,
    scenario: 'scenario-basic',
    input: {
      source_ip: '192.168.1.100',
      destination: 'api.example.com',
      destination_port: 22,
      protocol: 'TCP',
      initial_ttl: 5
    }
  },
  {
    id: '06_longest_prefix_match',
    title: 'Test Case 6: Longest Prefix Match (LPM) Specificity',
    description: 'IP 10.1.2.50 matches /32 host route over /24, /16, and /8 overlapping routes.',
    simulator: complexSim,
    scenario: 'scenario-complex',
    input: {
      source_ip: '10.100.0.50',
      destination: '10.1.2.50',
      destination_port: 443,
      protocol: 'TCP',
      initial_ttl: 8
    }
  },
  {
    id: '07_multi_level_cname',
    title: 'Test Case 7: Multi-Level CNAME Chain Resolution',
    description: 'portal.corp.net -> app.corp.net -> origin.corp.net -> 172.16.20.100.',
    simulator: complexSim,
    scenario: 'scenario-complex',
    input: {
      source_ip: '10.100.0.50',
      destination: 'portal.corp.net',
      destination_port: 443,
      protocol: 'TCP',
      initial_ttl: 10
    }
  },
  {
    id: '08_firewall_default_deny',
    title: 'Test Case 8: Firewall Default-Deny Policy',
    description: 'Unmatched destination port 9999 denied by implicit default-deny security policy.',
    simulator: basicSim,
    scenario: 'scenario-basic',
    input: {
      source_ip: '192.168.1.100',
      destination: 'api.example.com',
      destination_port: 9999,
      protocol: 'TCP',
      initial_ttl: 5
    }
  }
];

console.log('='.repeat(70));
console.log('VIRTUAL NETWORK SIMULATOR - AUTOMATED DEMONSTRATION RUN');
console.log('='.repeat(70));

const summary = [];

for (const tc of testCases) {
  console.log(`\n\x1b[36m[RUNNING]\x1b[0m ${tc.title}`);
  console.log(`Scenario: ${tc.scenario}`);
  console.log(`Input Packet:`, JSON.stringify(tc.input, null, 2));

  const result = tc.simulator.simulate(tc.input);
  console.log(`Trace Events (${result.trace.length} steps):`);
  for (const step of result.trace) {
    console.log(`  Step ${step.step} [${step.component}]: ${step.action}`);
  }

  // Save individual test case artifact
  const artifactPath = path.join(outputDir, `${tc.id}.json`);
  fs.writeFileSync(artifactPath, JSON.stringify({
    title: tc.title,
    description: tc.description,
    scenario: tc.scenario,
    input: tc.input,
    output: result
  }, null, 2));

  summary.push({
    id: tc.id,
    title: tc.title,
    scenario: tc.scenario,
    input: tc.input,
    trace: result.trace
  });
}

const summaryFile = path.join(outputDir, 'demonstration_summary.json');
fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
console.log(`\n\x1b[32m[SUCCESS]\x1b[0m All demonstration runs saved to ${outputDir}/`);
