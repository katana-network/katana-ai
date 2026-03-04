FROM node:24-bookworm AS builder

WORKDIR /app

# Copy package files (root workspace + katana-mcp workspace)
COPY package.json package-lock.json ./
COPY packages/katana-mcp/package.json ./packages/katana-mcp/

# Install all dependencies (including devDependencies for tsc)
RUN npm ci

# Copy workspace source
COPY packages/katana-mcp/ ./packages/katana-mcp/

# Build TypeScript
RUN npm run build -w packages/katana-mcp

# Remove devDependencies after build
RUN npm prune --production

FROM node:24-slim

WORKDIR /app

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/katana-mcp/dist ./packages/katana-mcp/dist

# Copy package.json files (needed for module resolution)
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/katana-mcp/package.json ./packages/katana-mcp/

# Set production environment
ENV NODE_ENV=production
ENV PORT=3001

# Run as non-root user
RUN groupadd -r app && useradd -r -g app app
RUN chown -R app:app /app
USER app

WORKDIR /app/packages/katana-mcp

CMD ["node", "dist/server.js", "--http"]
