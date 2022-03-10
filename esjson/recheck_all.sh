#!/bin/sh
exec curl -v -XPOST -H 'Content-Type: application/json' 'http://elasticsearch:9200/e621posts/_update_by_query?conflicts=proceed' --data-raw '{
    "script":
    {
        "source": "ctx._source.file_downloaded = false; ctx._source.sample_downloaded = false; ctx._source.preview_downloaded = false;",
        "lang": "painless"
    }
}'
