FROM node:22-alpine

WORKDIR /app

# Copy manifests first so dependency layers cache across code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

# Runs the gateway bot: presence, /gold, the refresh button, and price checks
# every REFRESH_SECONDS. Configure via environment variables, never a .env file
# baked into the image.
CMD ["node", "src/index.js"]
