/**
 * DNS Resolver component.
 * Handles A records, CNAME chains, loop detection, recursion depth limits, and NXDOMAIN.
 */

const { normalizeHostname, isValidIPv4 } = require('../utils/ipUtils');

const MAX_CNAME_DEPTH = 5;

class DNSResolver {
  /**
   * @param {Record<string, { type: 'A' | 'CNAME', value: string }>} dnsRecords
   * @param {number} [maxDepth=5]
   */
  constructor(dnsRecords = {}, maxDepth = MAX_CNAME_DEPTH) {
    this.records = dnsRecords;
    this.maxDepth = maxDepth;
  }

  /**
   * Resolves a destination hostname to an IPv4 address.
   * Records steps in the provided trace builder function or array.
   *
   * @param {string} destination - Hostname to resolve
   * @returns {{ success: boolean, ip?: string, error?: string, events: Array<{ component: string, action: string }> }}
   */
  resolve(destination) {
    const events = [];
    const normalizedDest = normalizeHostname(destination);

    // If already an IPv4 address, DNS is skipped entirely
    if (isValidIPv4(destination)) {
      return { success: true, ip: destination, events };
    }

    let currentHostname = normalizedDest;
    const visited = new Set();
    let depth = 0;

    while (depth <= this.maxDepth) {
      if (visited.has(currentHostname)) {
        events.push({
          component: 'DNS',
          action: `DNS resolution failed: CNAME loop detected at ${currentHostname}`
        });
        return {
          success: false,
          error: 'CNAME_LOOP',
          events
        };
      }

      visited.add(currentHostname);

      const record = this.records[currentHostname];
      if (!record) {
        events.push({
          component: 'DNS',
          action: `NXDOMAIN: Domain '${currentHostname}' not found`
        });
        return {
          success: false,
          error: 'NXDOMAIN',
          events
        };
      }

      if (record.type === 'A') {
        const actionMsg = depth === 0
          ? `Resolved ${normalizedDest} to ${record.value}`
          : `Resolved ${normalizedDest} (via ${currentHostname}) to ${record.value}`;

        events.push({
          component: 'DNS',
          action: actionMsg
        });

        return {
          success: true,
          ip: record.value,
          events
        };
      }

      if (record.type === 'CNAME') {
        depth += 1;
        if (depth > this.maxDepth) {
          events.push({
            component: 'DNS',
            action: `DNS resolution failed: CNAME recursion limit exceeded (max ${this.maxDepth} hops) resolving ${normalizedDest}`
          });
          return {
            success: false,
            error: 'RECURSION_LIMIT_EXCEEDED',
            events
          };
        }

        const targetHostname = normalizeHostname(record.value);
        events.push({
          component: 'DNS',
          action: `CNAME lookup: ${currentHostname} is an alias for ${targetHostname}`
        });
        currentHostname = targetHostname;
        continue;
      }

      // Unsupported record type
      events.push({
        component: 'DNS',
        action: `DNS resolution failed: Unsupported record type '${record.type}' for ${currentHostname}`
      });
      return {
        success: false,
        error: 'INVALID_RECORD',
        events
      };
    }

    events.push({
      component: 'DNS',
      action: `DNS resolution failed: CNAME recursion limit exceeded resolving ${normalizedDest}`
    });
    return {
      success: false,
      error: 'RECURSION_LIMIT_EXCEEDED',
      events
    };
  }
}

module.exports = {
  DNSResolver,
  MAX_CNAME_DEPTH
};
