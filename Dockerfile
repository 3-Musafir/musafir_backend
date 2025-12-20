# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies and build app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN mkdir -p dist/mail/templates && cp -r src/mail/templates/*.hbs dist/mail/templates/

# Production stage
FROM node:22-alpine

WORKDIR /app

# Only copy production files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN npm install --omit=dev

EXPOSE 5001

CMD ["node", "dist/main.js"]