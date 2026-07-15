FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY public/ ./public/
COPY server.js ./
RUN mkdir -p /app/data && chown -R node:node /app/data
ENV DATA_DIR=/app/data
EXPOSE 8080
USER node
CMD ["node", "server.js"]
