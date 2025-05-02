#!/bin/sh

curl -v -XPOST "$(hostname):9200/_reindex" -H 'Content-Type: application/json' --data-raw '{
  "source": {
    "index": "e621posts_1"
  },
  "dest": {
    "index": "e621posts_2"
  }
}'

curl -v -XPOST "$(hostname):9200/_aliases" -H 'Content-Type: application/json' --data-raw '{
    "actions" : [
        { "add" : { "index" : "e621posts_2", "alias" : "e621posts" } }
    ]
}'
