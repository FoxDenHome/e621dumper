FROM node:lts-alpine

RUN apk add bash curl cronie s6

COPY etc /etc
COPY . /opt/app

RUN mkdir -p /config && ln -s /config/config.json /opt/app/config.json

WORKDIR /opt/app
RUN npm ci && npm run build

VOLUME /config
VOLUME /data

ENTRYPOINT ["s6-svscan", "/etc/s6"]
