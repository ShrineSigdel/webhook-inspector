# syntax=docker/dockerfile:1

# Build stage: TypeScript and dev dependencies never reach the runtime image.
FROM node:20-alpine AS build
WORKDIR /app

# Copy the manifests first so Docker can cache `npm ci` between source edits.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Only production dependencies are installed. bcrypt ships musl prebuilds,
# so alpine does not need a compiler in this stage.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The image is read-only for the app; `node` owns nothing and needs nothing.
COPY --from=build /app/dist ./dist
USER node

EXPOSE 3000
# One image serves both processes; Compose overrides the command for the worker.
CMD ["node", "dist/server.js"]
