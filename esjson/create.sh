#!/usr/bin/env bash
set -ex

curl -v -XPUT -H 'Content-Type: application/json' 'http://opensearch:9200/e621dumper_posts_1' --data @index.json

curl -v -XPOST -H 'Content-Type: application/json' 'http://opensearch:9200/_aliases' --data @alias.json
