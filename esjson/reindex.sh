#!/bin/sh
set -ex

OLDVER="${1-}"
NEWVER="${2-}"

if [ -z "${OLDVER}" ]; then
	echo "Provide OLDVER"
	exit 1
fi

if [ -z "${NEWVER}" ]; then
	echo "Provide NEWVER"
	exit 1
fi

curl -f -v -XPUT -H 'Content-Type: application/json' "http://elasticsearch:9200/e621posts_${NEWVER}" --data @index.json

curl -f -v -XPOST 'http://elasticsearch:9200/_reindex' -H 'Content-Type: application/json' --data-raw "{
  \"source\": {
    \"index\": \"e621posts_${OLDVER}\"
  },
  \"dest\": {
    \"index\": \"e621posts_${NEWVER}\"
  }
}"

curl -f -v -XPOST 'http://elasticsearch:9200/_aliases' -H 'Content-Type: application/json' --data-raw "{
    \"actions\" : [
        { \"add\": { \"index\": \"e621posts_${NEWVER}\", \"alias\": \"e621posts\" } },
        { \"remove\": { \"index\" : \"e621posts_${OLDVER}\", \"alias\": \"e621posts\" } }
    ]
}"

echo 'Run the following commands to delete the old indices:'
echo "curl -XDELETE 'http://elasticsearch:9200/e621posts_${OLDVER}'"
