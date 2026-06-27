# Production image for Jenkins pipeline Docker build stage
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

# Copy dependency manifests first — Docker reuses this layer when only app code changes
COPY package*.json ./

# Install production dependencies only (smaller image, no dev/test tools)
RUN npm ci --omit=dev

# Application source, views, and static assets
COPY src ./src
COPY views ./views
COPY public ./public

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000

CMD ["node", "src/server.js"]
