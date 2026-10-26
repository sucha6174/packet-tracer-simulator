/**
 * Configuration loader and validator for scenario files.
 */

const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { ConfigError } = require('../utils/errors');
const { isValidIPv4, isValidHostname, isValidCIDR, normalizeHostname } = require('../utils/ipUtils');

// Schema for DNS configuration
const dnsEntrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('A'),
    value: z.string().trim().refine(isValidIPv4, {
      message: "Value for 'A' record must be a valid IPv4 address"
    })
  }),
  z.object({
    type: z.literal('CNAME'),
    value: z.string().trim().refine(isValidHostname, {
      message: "Value for 'CNAME' record must be a valid hostname"
    }).transform(normalizeHostname)
  })
]);

const dnsFileSchema = z.record(
  z.string().refine(isValidHostname, { message: 'DNS key must be a valid hostname' }),
  dnsEntrySchema
);

// Schema for Routes configuration
const routeEntrySchema = z.object({
  destination_cidr: z.string().trim().refine(isValidCIDR, {
    message: 'destination_cidr must be a valid IPv4 CIDR (e.g., 10.0.0.0/8)'
  }),
  next_hop: z.string().trim().refine(isValidIPv4, {
    message: 'next_hop must be a valid IPv4 address'
  }),
  interface: z.string().trim().min(1, {
    message: 'interface must be a non-empty string'
  })
});

const routesFileSchema = z.array(routeEntrySchema).min(0);

// Schema for Firewall configuration
const firewallEntrySchema = z.object({
  rule_id: z.union([z.number().int(), z.string().min(1)]),
  action: z.string().trim().transform((val) => val.toLowerCase()).refine(
    (val) => val === 'allow' || val === 'deny',
    { message: "action must be either 'allow' or 'deny'" }
  ),
  source_cidr: z.string().trim().refine(isValidCIDR, {
    message: 'source_cidr must be a valid IPv4 CIDR (e.g., 0.0.0.0/0)'
  }),
  destination_port: z.union([
    z.literal('*'),
    z.number().int().min(1).max(65535),
    z.string().trim().refine((v) => v === '*', { message: "port must be an integer (1-65535) or '*'" })
  ]).transform((val) => {
    if (val === '*') return '*';
    return Number(val);
  }),
  protocol: z.string().trim().transform((val) => val.toUpperCase()).refine(
    (val) => val === 'TCP' || val === 'UDP' || val === '*',
    { message: "protocol must be 'TCP', 'UDP', or '*'" }
  )
});

const firewallFileSchema = z.array(firewallEntrySchema).min(0);

/**
 * Reads and parses a JSON file synchronously on startup.
 * @param {string} filePath
 * @param {string} fileLabel
 * @returns {any}
 */
function readJsonFileSync(filePath, fileLabel) {
  if (!fs.existsSync(filePath)) {
    throw new ConfigError(`Required configuration file not found: ${filePath} (${fileLabel})`);
  }
  let rawContent;
  try {
    rawContent = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new ConfigError(`Cannot read configuration file: ${filePath} (${fileLabel}): ${err.message}`);
  }
  try {
    return JSON.parse(rawContent);
  } catch (err) {
    throw new ConfigError(`Malformed JSON in configuration file: ${filePath} (${fileLabel}): ${err.message}`);
  }
}

/**
 * Loads and strictly validates all configuration files for the specified scenario path.
 * @param {string} [configDir]
 * @returns {{ configPath: string, dns: Record<string, any>, routes: Array<any>, firewall: Array<any> }}
 */
function loadConfig(configDir) {
  const resolvedDir = configDir || process.env.CONFIG_PATH;
  if (!resolvedDir || typeof resolvedDir !== 'string' || resolvedDir.trim() === '') {
    throw new ConfigError('FATAL: CONFIG_PATH environment variable missing or empty');
  }

  const absoluteDir = path.isAbsolute(resolvedDir)
    ? resolvedDir
    : path.resolve(process.cwd(), resolvedDir);

  if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) {
    throw new ConfigError(`FATAL: Configuration directory does not exist or is not a directory: ${absoluteDir}`);
  }

  const dnsPath = path.join(absoluteDir, 'dns.json');
  const routesPath = path.join(absoluteDir, 'routes.json');
  const firewallPath = path.join(absoluteDir, 'firewall.json');

  // Load raw JSON
  const rawDns = readJsonFileSync(dnsPath, 'dns.json');
  const rawRoutes = readJsonFileSync(routesPath, 'routes.json');
  const rawFirewall = readJsonFileSync(firewallPath, 'firewall.json');

  // Validate DNS
  const dnsResult = dnsFileSchema.safeParse(rawDns);
  if (!dnsResult.success) {
    const errorDetails = dnsResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new ConfigError(`Validation failed for dns.json at ${dnsPath}: ${errorDetails}`);
  }

  // Validate Routes
  const routesResult = routesFileSchema.safeParse(rawRoutes);
  if (!routesResult.success) {
    const errorDetails = routesResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new ConfigError(`Validation failed for routes.json at ${routesPath}: ${errorDetails}`);
  }

  // Validate Firewall
  const firewallResult = firewallFileSchema.safeParse(rawFirewall);
  if (!firewallResult.success) {
    const errorDetails = firewallResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new ConfigError(`Validation failed for firewall.json at ${firewallPath}: ${errorDetails}`);
  }

  // Normalize DNS record keys to lowercase normalized hostnames
  const normalizedDns = {};
  for (const [key, record] of Object.entries(dnsResult.data)) {
    normalizedDns[normalizeHostname(key)] = {
      type: record.type,
      value: record.type === 'CNAME' ? normalizeHostname(record.value) : record.value
    };
  }

  return Object.freeze({
    configPath: absoluteDir,
    scenarioName: path.basename(absoluteDir),
    dns: Object.freeze(normalizedDns),
    routes: Object.freeze(routesResult.data.map((r) => Object.freeze({ ...r }))),
    firewall: Object.freeze(firewallResult.data.map((f) => Object.freeze({ ...f })))
  });
}

module.exports = {
  loadConfig,
  dnsFileSchema,
  routesFileSchema,
  firewallFileSchema
};
