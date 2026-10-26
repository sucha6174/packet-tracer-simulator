/**
 * API route handlers for packet tracer simulator.
 */

const express = require('express');

/**
 * Creates API router bound to a given NetworkSimulator instance and config.
 * @param {import('../core/simulator').NetworkSimulator} simulator
 * @param {object} config
 * @returns {express.Router}
 */
function createApiRouter(simulator, config) {
  const router = express.Router();

  // GET /health - Service health check
  router.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      scenario: simulator.scenarioName,
      routes_count: (config.routes || []).length,
      dns_records_count: Object.keys(config.dns || {}).length,
      firewall_rules_count: (config.firewall || []).length
    });
  });

  // POST /trace - Main packet tracing endpoint
  router.post('/trace', (req, res, next) => {
    try {
      const result = simulator.simulate(req.body);
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = {
  createApiRouter
};
