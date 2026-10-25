# Nikkilog — production image
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first so this layer is cached between builds
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Uploads live here; mount a volume over it so they survive a redeploy
VOLUME ["/app/public/uploads"]

EXPOSE 5000
CMD ["node", "server.js"]
