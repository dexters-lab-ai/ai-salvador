# Stage 1: Build the React application
FROM node:18-alpine AS build

WORKDIR /usr/src/app

# Build-time env for Vite (set via --build-arg), with safe defaults
ARG VITE_ADMIN=0
ARG VITE_CONVEX_URL
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_ADMIN=$VITE_ADMIN \
    VITE_CONVEX_URL=$VITE_CONVEX_URL \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Build the application for production
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:stable-alpine

# Copy the built files from the build stage
COPY --from=build /usr/src/app/dist /usr/share/nginx/html

# Copy the Nginx configuration file
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
