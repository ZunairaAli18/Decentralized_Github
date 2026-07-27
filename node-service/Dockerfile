FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN mkdir -p /app/repos
EXPOSE 4001
CMD ["node", "src/index.js"]