/**
 * Application entry point for Packet Tracer Simulator server.
 */

require('dotenv').config();
const { loadConfig } = require('./core/configLoader');
const { createApp } = require('./app');

const PORT = parseInt(process.env.PORT || '8080', 10);
const CONFIG_PATH = process.env.CONFIG_PATH;

function startServer() {
  let config;
  try {
    config = loadConfig(CONFIG_PATH);
  } catch (err) {
    // Fail fast with informative message and exit
    console.error(`\x1b[31m[STARTUP ERROR]\x1b[0m ${err.message}`);
    process.exit(1);
  }

  const app = createApp(config);

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\x1b[32m[SERVER RUNNING]\x1b[0m Packet Tracer Simulator listening on port ${PORT}`);
    console.log(`[CONFIGURATION] Scenario loaded: '${config.scenarioName}' from ${config.configPath}`);
    console.log(`[CONFIGURATION] DNS records: ${Object.keys(config.dns).length}, Routes: ${config.routes.length}, Firewall rules: ${config.firewall.length}`);
  });

  const shutdown = (signal) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed. Exiting process.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer
};
