/**
 * Express application factory with security headers and robust error handling.
 */

const express = require('express');
const { createApiRouter } = require('./api/routes');
const { NetworkSimulator } = require('./core/simulator');
const { ValidationError, AppError } = require('./utils/errors');

/**
 * Creates and configures the Express application.
 * @param {object} config - Loaded scenario configuration
 * @returns {express.Express}
 */
function createApp(config) {
  const app = express();

  // Security best practices: hide Express banner
  app.disable('x-powered-by');

  // JSON Body parser
  app.use(express.json({ limit: '100kb' }));

  // Middleware to catch malformed JSON payloads from body-parser
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Malformed JSON payload in request body'
      });
    }
    return next(err);
  });

  // Instantiate Simulator with loaded configuration
  const simulator = new NetworkSimulator(config);

  // Mount API endpoints
  app.use('/', createApiRouter(simulator, config));

  // 404 Handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Cannot ${req.method} ${req.originalUrl}`
    });
  });

  // Centralized Error Handling Middleware
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) {
      return res.status(400).json({
        error: 'Bad Request',
        message: err.message,
        details: err.details || null
      });
    }

    if (err instanceof AppError) {
      return res.status(err.statusCode || 500).json({
        error: err.name || 'Application Error',
        message: err.message
      });
    }

    // Unhandled server errors (never leak stack trace in response)
    const isProd = process.env.NODE_ENV === 'production';
    return res.status(500).json({
      error: 'Internal Server Error',
      message: isProd ? 'An unexpected server error occurred' : err.message
    });
  });

  return app;
}

module.exports = {
  createApp
};
