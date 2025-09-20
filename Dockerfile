# Use Node.js LTS with Alpine base
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies including Python and build tools
RUN apk add --no-cache --update \
    git \
    python3 \
    make \
    g++ \
    gcc \
    py3-pip \
    && ln -sf python3 /usr/bin/python

# Set Python environment variables
ENV PYTHON=/usr/bin/python3
ENV PYTHONUNBUFFERED=1

# Copy package files first for better caching
COPY package*.json ./

# Install npm dependencies with legacy peer deps to avoid conflicts
RUN npm config set python /usr/bin/python3 \
    && npm config set unsafe-perm true \
    && npm install -g npm@latest \
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