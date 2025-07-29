FROM node:22-alpine

ARG PORT

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production
COPY . .

RUN mkdir -p images
RUN addgroup -g 1001 -S nodejs
RUN adduser -S bot -u 1001

RUN chown -R bot:nodejs /app
USER bot

EXPOSE ${PORT}

CMD ["npm", "start"]