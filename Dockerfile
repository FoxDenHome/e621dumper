FROM node:lts-alpine

RUN apk add bash curl

COPY . /opt/app

RUN mkdir -p /config && ln -s /config/config.json /opt/app/config.json

WORKDIR /opt/app
RUN npm ci && npm run build

VOLUME /config
VOLUME /data

ENTRYPOINT ["node", "./dist/api/index.js"]
