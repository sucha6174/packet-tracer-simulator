/**
 * Stateless Firewall module with sequential rule evaluation and default-deny policy.
 */

const { isIPInCIDR } = require('../utils/ipUtils');

class Firewall {
  /**
   * @param {Array<{ rule_id: number | string, action: 'allow' | 'deny', source_cidr: string, destination_port: number | '*', protocol: 'TCP' | 'UDP' | '*' }>} rules
   */
  constructor(rules = []) {
    this.rules = rules;
  }

  /**
   * Evaluates a packet against firewall rules in top-to-bottom order.
   *
   * @param {{ source_ip: string, destination_port: number, protocol: string }} packet
   * @returns {{
   *   allowed: boolean,
   *   matchedRule?: object,
   *   isDefaultDeny: boolean,
   *   events: Array<{ component: string, action: string }>
   * }}
   */
  evaluate(packet) {
    const events = [];
    const packetProto = (packet.protocol || '').toUpperCase();
    const packetPort = Number(packet.destination_port);
    const packetSourceIp = packet.source_ip;

    for (const rule of this.rules) {
      // 1. Check Source CIDR
      const sourceMatch = isIPInCIDR(packetSourceIp, rule.source_cidr);
      if (!sourceMatch) {
        continue;
      }

      // 2. Check Destination Port
      const portMatch = rule.destination_port === '*' || Number(rule.destination_port) === packetPort;
      if (!portMatch) {
        continue;
      }

      // 3. Check Protocol
      const ruleProto = (rule.protocol || '').toUpperCase();
      const protoMatch = ruleProto === '*' || ruleProto === packetProto;
      if (!protoMatch) {
        continue;
      }

      // All criteria match: rule is triggered
      const action = rule.action.toLowerCase();
      if (action === 'deny') {
        events.push({
          component: 'Firewall',
          action: `Packet denied by rule ${rule.rule_id} (source: ${rule.source_cidr}, port: ${rule.destination_port}, protocol: ${rule.protocol})`
        });
        return {
          allowed: false,
          matchedRule: rule,
          isDefaultDeny: false,
          events
        };
      }

      if (action === 'allow') {
        events.push({
          component: 'Firewall',
          action: `Packet allowed by rule ${rule.rule_id} (source: ${rule.source_cidr}, port: ${rule.destination_port}, protocol: ${rule.protocol})`
        });
        return {
          allowed: true,
          matchedRule: rule,
          isDefaultDeny: false,
          events
        };
      }
    }

    // Default action: Default-Deny
    events.push({
      component: 'Firewall',
      action: 'Packet denied by default policy. No matching rules.'
    });

    return {
      allowed: false,
      isDefaultDeny: true,
      events
    };
  }
}

module.exports = {
  Firewall
};
