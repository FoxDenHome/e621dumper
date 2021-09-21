FROM elasticsearch:7.14.1

ENV discovery.type=single-node

RUN yum -y install bash nodejs npm

COPY scripts /opt/app/scripts
COPY esjson /opt/app/esjson

WORKDIR /opt/app/scripts
RUN npm ci && npm run build
