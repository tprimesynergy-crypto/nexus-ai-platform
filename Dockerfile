FROM node:20-alpine

LABEL maintainer="Prime Synergy Group <b86.messaoudi@gmail.com>"
LABEL description="Nexus AI Platform — TANGER NEXUS 2026"

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production --silent

# Copy application files
COPY server.js ./
COPY public ./public/

# Non-root user for security
RUN addgroup -g 1001 -S nexus && adduser -S nexus -u 1001
RUN chown -R nexus:nexus /app
USER nexus

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/status || exit 1

CMD ["node", "server.js"]
