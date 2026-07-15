FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY public/ ./public/
COPY server.js ./
RUN mkdir -p /app/data
ENV DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server.js"]
