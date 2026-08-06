# 1. Development & Build Stage
FROM node:18-alpine AS development

WORKDIR /usr/src/app

# Copy monorepo root configuration files
COPY package*.json ./
RUN npm install

# Copy full source tree
COPY . .

# Compile the specific gateway application
RUN npx nest build api-gateway

# 2. Production Runner Stage
FROM node:18-alpine AS production

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

# Grab built assets from development phase
COPY --from=development /usr/src/app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/apps/api-gateway/main"]