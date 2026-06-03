# Production image for Jenkins pipeline Docker build stage
FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests first — Docker reuses this layer when only app code changes
COPY package*.json ./

# Install production dependencies only (smaller image, no dev/test tools)
RUN npm ci --only=production

# Application source, views, and static assets
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
