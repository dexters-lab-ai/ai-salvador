# Use Node.js LTS with Debian base
FROM node:18-slim

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

# Install npm dependencies with legacy peer deps
RUN npm install -g npm@latest \
    && npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build-time arguments
ARG VITE_CONVEX_URL
ARG VITE_CLERK_PUBLISHABLE_KEY

# Environment variables
ENV NODE_ENV=development \
    CHOKIDAR_USEPOLLING=true \
    VITE_CONVEX_URL=${VITE_CONVEX_URL} \
    VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY} \
    NPM_CONFIG_PYTHON=/usr/bin/python3

# Expose port
EXPOSE 3000

# Start development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]