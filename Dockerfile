# Use Node.js LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache git

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies (including devDependencies for development)
RUN npm install

# Copy source code
COPY . .

# Build-time arguments
ARG VITE_CONVEX_URL
ARG VITE_CLERK_PUBLISHABLE_KEY

# Environment variables
ENV NODE_ENV=development \
    CHOKIDAR_USEPOLLING=true \
    VITE_CONVEX_URL=${VITE_CONVEX_URL} \
    VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}

# Expose port
EXPOSE 3000

# Start development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]