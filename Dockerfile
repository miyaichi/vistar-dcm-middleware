FROM node:20-alpine

WORKDIR /usr/src/app

ENV HUSKY=0

COPY package*.json ./

RUN npm install && npm prune --omit=dev

ENV NODE_ENV=production

COPY src ./src
COPY .env.example .env.example

EXPOSE 3000

CMD ["npm", "start"]
