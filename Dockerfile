# Use Node.js 20 LTS with Debian base
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set Python environment variables
ENV PYTHON=python3
ENV PYTHONUNBUFFERED=1

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies with legacy peer deps
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Environment variables - will be overridden by docker-compose
ENV NODE_ENV=production \
    CHOKIDAR_USEPOLLING=true \
    CI=true \
    CONVEX_CLI_DISABLE_UPDATE_CHECK=true \
    CONVEX_CLI_LOG_LEVEL=error \
    VITE_CONVEX_URL=$VITE_CONVEX_URL \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY \
    NPM_CONFIG_PYTHON=/usr/bin/python3

# Expose port
EXPOSE 3000

# Start development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]