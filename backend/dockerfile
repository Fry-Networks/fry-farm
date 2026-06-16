#this is dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=prod

COPY . .

EXPOSE 5000

CMD ["node", "index.js"]
