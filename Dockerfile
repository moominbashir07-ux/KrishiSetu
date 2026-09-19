# KrishiSetu 2.0 — Production Container Image
# Multi-stage optimized build for AWS App Runner / ECS Fargate

FROM node:22-alpine AS runtime

# Install dumb-init for proper kernel signal forwarding & process reaping
RUN apk add --no-cache dumb-init

# Set working directory
WORKDIR /app

# Ensure production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy package manifests first for optimal layer caching
COPY package*.json ./

# Install production dependencies only with reproducible clean install
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy application source code (ignoring paths in .dockerignore)
COPY . .

# Ensure files are owned by unprivileged node user
RUN chown -R node:node /app

# Drop root privileges
USER node

# Expose standard container port
EXPOSE 3000

# Healthcheck monitoring liveness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start application wrapped in dumb-init for graceful SIGTERM/SIGINT shutdown
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
