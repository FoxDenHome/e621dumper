FROM elasticsearch:7.14.1

ENV discovery.type=single-node

RUN yum -y install bash nodejs npm


COPY scripts /opt/app/scripts
COPY esjson /opt/app/esjson

RUN mkdir -p /config && ln -s /config/config.json /opt/app/scripts/config.json

WORKDIR /opt/app/scripts
RUN npm ci && npm run build

VOLUME /config
VOLUME /usr/share/elasticsearch/data
