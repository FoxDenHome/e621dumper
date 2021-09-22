FROM elasticsearch:7.14.1

RUN yum -y install bash nodejs npm

COPY . /opt/app

RUN mkdir -p /config && ln -s /config/config.json /opt/app/config.json

WORKDIR /opt/app
RUN npm ci && npm run build

VOLUME /config
VOLUME /usr/share/elasticsearch/data

ENV discovery.type=single-node
ENV network.host=_local_
ENV network.bind_host=_local_
