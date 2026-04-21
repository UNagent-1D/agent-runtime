# --- STAGE 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install ALL dependencies
COPY package*.json ./
RUN npm install

# Copy source and config
COPY . .

# Compile TypeScript to JavaScript (creates the /dist folder)
RUN npx tsc

# --- STAGE 2: Run ---
FROM node:20-alpine

WORKDIR /app

# Copy only the compiled code and production-ready package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install ONLY production dependencies (no devDependencies)
RUN npm install --omit=dev

EXPOSE 3100

# Run the compiled JS from the dist folder
CMD ["node", "dist/index.js"]