#!/bin/bash

cd /opt/app
node ./dist/api/index.js &
/usr/local/bin/docker-entrypoint.sh eswrapper &

wait
