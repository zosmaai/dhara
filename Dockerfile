# ── Multi-stage Docker build for Dhara ──────────────────────────────
# Usage:
#   docker build -t ghcr.io/zosmaai/dhara .
#   docker run -it --rm -v $(pwd):/workspace -w /workspace ghcr.io/zosmaai/dhara "List files"

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# Stage 2: Runtime
FROM node:22-alpine AS runtime

RUN apk add --no-cache git bash python3

WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./

# Create dhara user
RUN addgroup -g 1001 dhara && \
    adduser -D -h /home/dhara -G dhara -u 1001 dhara && \
    mkdir -p /home/dhara/.dhara && \
    chown -R dhara:dhara /home/dhara/.dhara

USER dhara
ENV HOME=/home/dhara
ENV NODE_ENV=production

ENTRYPOINT ["node", "/app/dist/cli/main.js"]
CMD ["--help"]
