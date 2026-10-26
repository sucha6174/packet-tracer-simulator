/**
 * Central Simulation Orchestrator.
 * Coordinates DNS, Router, and Firewall modules to simulate a packet journey.
 */

const { isValidIPv4 } = require('../utils/ipUtils');
const { DNSResolver } = require('../components/dnsResolver');
const { Router } = require('../components/router');
const { Firewall } = require('../components/firewall');
const { validatePacket } = require('./packetValidator');

class NetworkSimulator {
  /**
   * @param {{ dns: Record<string, any>, routes: Array<any>, firewall: Array<any>, scenarioName?: string }} config
   */
  constructor(config) {
    if (!config) {
      throw new Error('NetworkSimulator requires a valid configuration object');
    }
    this.scenarioName = config.scenarioName || 'default';
    this.dnsResolver = new DNSResolver(config.dns || {});
    this.router = new Router(config.routes || []);
    this.firewall = new Firewall(config.firewall || []);
  }

  /**
   * Simulates the journey of a packet through the virtual network.
   *
   * @param {object} packetInput - Raw or validated packet input
   * @returns {{ trace: Array<{ step: number, component: string, action: string }> }}
   */
  simulate(packetInput) {
    // 1. Strictly validate and normalize packet payload
    const packet = validatePacket(packetInput);

    const rawEvents = [];
    let destinationIp = packet.destination;

    // 2. DNS Resolution Phase
    if (!isValidIPv4(packet.destination)) {
      const dnsResult = this.dnsResolver.resolve(packet.destination);
      rawEvents.push(...dnsResult.events);

      if (!dnsResult.success) {
        return this._formatTraceResponse(rawEvents);
      }
      destinationIp = dnsResult.ip;
    }

    // 3. Routing Engine & TTL Phase
    const routingResult = this.router.processPacket(destinationIp, packet.initial_ttl);
    rawEvents.push(...routingResult.events);

    if (!routingResult.success) {
      return this._formatTraceResponse(rawEvents);
    }

    const matchedRoute = routingResult.route;

    // 4. Firewall Evaluation Phase
    const firewallResult = this.firewall.evaluate({
      source_ip: packet.source_ip,
      destination_port: packet.destination_port,
      protocol: packet.protocol
    });
    rawEvents.push(...firewallResult.events);

    if (!firewallResult.allowed) {
      return this._formatTraceResponse(rawEvents);
    }

    // 5. Final Forwarding Phase
    rawEvents.push(this.router.createForwardingEvent(matchedRoute));

    return this._formatTraceResponse(rawEvents);
  }

  /**
   * Assigns sequential 1-based step numbers to each trace event.
   *
   * @private
   * @param {Array<{ component: string, action: string }>} rawEvents
   * @returns {{ trace: Array<{ step: number, component: string, action: string }> }}
   */
  _formatTraceResponse(rawEvents) {
    const trace = rawEvents.map((evt, idx) => ({
      step: idx + 1,
      component: evt.component,
      action: evt.action
    }));

    return { trace };
  }
}

module.exports = {
  NetworkSimulator
};
