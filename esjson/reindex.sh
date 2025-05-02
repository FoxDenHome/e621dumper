#!/bin/sh

# Make sure to change the numbers below!
OLDVER=1
NEWVER=2

curl -v -XPOST 'http://elasticsearch:9200/_reindex' -H 'Content-Type: application/json' --data-raw "{
  \"source\": {
    \"index\": \"e621posts_${OLDVER}\"
  },
  \"dest\": {
    \"index\": \"e621posts_${NEWVER}\"
  }
}"

curl -v -XPOST 'http://elasticsearch:9200/_aliases' -H 'Content-Type: application/json' --data-raw "{
    \"actions\" : [
        { \"add\": { \"index\": \"e621posts_${NEWVER}\", \"alias\": \"e621posts\" } },
        { \"remove\": { \"index\" : \"e621posts_${OLDVER}\", \"alias\": \"e621posts\" } }
    ]
}"

echo 'Run the following commands to delete the old indices:'
echo "curl -XDELETE 'http://elasticsearch:9200/e621posts_${OLDVER}'"
