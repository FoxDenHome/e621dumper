#!/usr/bin/env bash

if [ ! -z "${LOOPER_DISABLE-}" ]; then
	echo 'Disabled'
	exit 0
fi

echo 'Fetch'
until e621dumper-fetchnew
do
	echo 'Retrying fetch'
	sleep 10
done

sleep 10
echo 'DL file'
until e621dumper-downloadfiles --type=file --looper
do
	echo 'Retrying DL file'
	sleep 10
done
