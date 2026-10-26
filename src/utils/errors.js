/**
 * Custom application errors for packet tracer simulator.
 */

class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
  }
}

class ConfigError extends AppError {
  constructor(message, details = null) {
    super(message, 500, details);
  }
}

class SimulationError extends AppError {
  constructor(message, details = null) {
    super(message, 500, details);
  }
}

module.exports = {
  AppError,
  ValidationError,
  ConfigError,
  SimulationError
};
