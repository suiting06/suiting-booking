FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY public/ ./public/
COPY server.js ./
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "server.js"]
