# Multi-stage or clean production Dockerfile
FROM node:22-alpine

# Set environment
ENV NODE_ENV=production
ENV PORT=8080
ENV CONFIG_PATH=config/scenario-basic

# Set working directory
WORKDIR /app

# Install dependencies first for optimal Docker layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source and configurations
COPY src/ ./src/
COPY config/ ./config/

# Ensure proper permissions for non-root node user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose server port
EXPOSE 8080

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

# Start server
CMD ["node", "src/server.js"]
