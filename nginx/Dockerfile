# syntax=docker/dockerfile:1

# Build the SPA with Node, then serve only the static output with Nginx.
# The build context is the repository root so this Dockerfile can reach frontend/.
FROM node:20-alpine AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
