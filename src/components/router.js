/**
 * Routing Engine implementing genuine Longest Prefix Match (LPM) and TTL lifecycle.
 */

const { isIPInCIDR, parseCIDR, isValidIPv4 } = require('../utils/ipUtils');

class Router {
  /**
   * @param {Array<{ destination_cidr: string, next_hop: string, interface: string }>} routes
   */
  constructor(routes = []) {
    // Pre-parse and validate route prefix lengths for fast and accurate LPM lookup
    this.routes = routes.map((route, index) => {
      const parsed = parseCIDR(route.destination_cidr);
      return {
        ...route,
        originalIndex: index,
        prefixLength: parsed.prefixLength,
        networkInt: parsed.networkInt,
        mask: parsed.mask
      };
    });
  }

  /**
   * Finds the best route for a given destination IP using Longest Prefix Match.
   * If multiple routes match, the one with the highest prefixLength is chosen.
   *
   * @param {string} destinationIp
   * @returns {{ destination_cidr: string, next_hop: string, interface: string, prefixLength: number } | null}
   */
  findBestRoute(destinationIp) {
    if (!isValidIPv4(destinationIp)) {
      return null;
    }

    const matchingRoutes = [];

    for (const route of this.routes) {
      if (isIPInCIDR(destinationIp, route.destination_cidr)) {
        matchingRoutes.push(route);
      }
    }

    if (matchingRoutes.length === 0) {
      return null;
    }

    // Sort by prefixLength descending (Longest Prefix Match)
    // If prefixLength is identical, maintain original order
    matchingRoutes.sort((a, b) => {
      if (b.prefixLength !== a.prefixLength) {
        return b.prefixLength - a.prefixLength;
      }
      return a.originalIndex - b.originalIndex;
    });

    const best = matchingRoutes[0];
    return {
      destination_cidr: best.destination_cidr,
      next_hop: best.next_hop,
      interface: best.interface,
      prefixLength: best.prefixLength
    };
  }

  /**
   * Processes the packet through the router:
   * 1. Evaluates LPM route lookup.
   * 2. Decrements TTL by 1.
   * 3. Checks for TTL expiration.
   *
   * @param {string} destinationIp
   * @param {number} currentTtl
   * @returns {{
   *   success: boolean,
   *   error?: 'NO_ROUTE' | 'TTL_EXCEEDED',
   *   route?: { destination_cidr: string, next_hop: string, interface: string, prefixLength: number },
   *   remainingTtl?: number,
   *   events: Array<{ component: string, action: string }>
   * }}
   */
  processPacket(destinationIp, currentTtl) {
    const events = [];

    const route = this.findBestRoute(destinationIp);
    if (!route) {
      events.push({
        component: 'Router',
        action: `No route to host: destination ${destinationIp} does not match any configured route`
      });
      return {
        success: false,
        error: 'NO_ROUTE',
        events
      };
    }

    const remainingTtl = currentTtl - 1;

    events.push({
      component: 'Router',
      action: `Route matched: ${route.destination_cidr} via ${route.next_hop} on ${route.interface} (prefix /${route.prefixLength}). Decremented TTL to ${remainingTtl}`
    });

    if (remainingTtl <= 0) {
      events.push({
        component: 'Router',
        action: 'Time to Live exceeded. Packet dropped.'
      });
      return {
        success: false,
        error: 'TTL_EXCEEDED',
        route,
        remainingTtl,
        events
      };
    }

    return {
      success: true,
      route,
      remainingTtl,
      events
    };
  }

  /**
   * Generates the trace event for forwarding the packet to its next hop.
   * @param {{ next_hop: string, interface: string }} route
   * @returns {{ component: string, action: string }}
   */
  createForwardingEvent(route) {
    return {
      component: 'Router',
      action: `Packet forwarded to next hop ${route.next_hop} via interface ${route.interface}`
    };
  }
}

module.exports = {
  Router
};
