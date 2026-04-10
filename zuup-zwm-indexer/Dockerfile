FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
COPY config/ config/
COPY idl/ idl/
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/ dist/
COPY idl/ idl/
EXPOSE 3001 4000
CMD ["node", "dist/src/index.js"]
