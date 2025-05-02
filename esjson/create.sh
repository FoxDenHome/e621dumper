#!/bin/sh
set -ex

curl -v -XPUT -H 'Content-Type: application/json' 'http://elasticsearch:9200/e621posts_1' --data @index.json

curl -v -XPOST -H 'Content-Type: application/json' 'http://elasticsearch:9200/_aliases' --data @alias.json
