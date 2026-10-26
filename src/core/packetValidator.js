/**
 * Strict packet payload validation using Zod and network utilities.
 */

const { z } = require('zod');
const { isValidIPv4, isValidHostname, normalizeHostname } = require('../utils/ipUtils');
const { ValidationError } = require('../utils/errors');

const packetSchema = z.object({
  source_ip: z
    .string({
      required_error: 'source_ip is required',
      invalid_type_error: 'source_ip must be a string'
    })
    .trim()
    .refine(isValidIPv4, {
      message: 'source_ip must be a valid IPv4 address (e.g. 192.168.1.1)'
    }),

  destination: z
    .string({
      required_error: 'destination is required',
      invalid_type_error: 'destination must be a string'
    })
    .trim()
    .refine((val) => isValidIPv4(val) || isValidHostname(val), {
      message: 'destination must be a valid IPv4 address or hostname'
    }),

  destination_port: z
    .number({
      required_error: 'destination_port is required',
      invalid_type_error: 'destination_port must be an integer number'
    })
    .int({ message: 'destination_port must be an integer' })
    .min(1, { message: 'destination_port must be between 1 and 65535' })
    .max(65535, { message: 'destination_port must be between 1 and 65535' }),

  protocol: z
    .string({
      required_error: 'protocol is required',
      invalid_type_error: 'protocol must be a string'
    })
    .trim()
    .transform((p) => p.toUpperCase())
    .refine((p) => p === 'TCP' || p === 'UDP', {
      message: "protocol must be either 'TCP' or 'UDP'"
    }),

  initial_ttl: z
    .number({
      required_error: 'initial_ttl is required',
      invalid_type_error: 'initial_ttl must be an integer number'
    })
    .int({ message: 'initial_ttl must be an integer' })
    .positive({ message: 'initial_ttl must be a positive integer greater than 0' })
}, { strict: true });

/**
 * Validates and normalizes an incoming packet payload.
 * Throws ValidationError if invalid.
 * @param {unknown} payload
 * @returns {{ source_ip: string, destination: string, destination_port: number, protocol: string, initial_ttl: number }}
 */
function validatePacket(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('Request body must be a valid JSON object');
  }

  const result = packetSchema.safeParse(payload);
  if (!result.success) {
    const formattedErrors = result.error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message
    }));
    const message = formattedErrors.map((e) => `${e.field}: ${e.message}`).join('; ');
    throw new ValidationError(`Packet validation failed: ${message}`, formattedErrors);
  }

  const data = result.data;
  // Normalize destination: if not IP, normalize hostname
  const isIp = isValidIPv4(data.destination);
  const normalizedDestination = isIp ? data.destination : normalizeHostname(data.destination);

  return {
    source_ip: data.source_ip,
    destination: normalizedDestination,
    destination_port: data.destination_port,
    protocol: data.protocol,
    initial_ttl: data.initial_ttl
  };
}

module.exports = {
  validatePacket,
  packetSchema
};
