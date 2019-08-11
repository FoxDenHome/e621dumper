#!/bin/bash

echo 'Fetch'
until node dist/bin/fetchnew.js
do
	echo 'Retrying fetch'
	sleep 5
done

echo 'DL file'
until node dist/bin/downloadfiles.js file error_if_found
do
	echo 'Retrying DL file'
	sleep 5
done

echo 'DL sample'
until node dist/bin/downloadfiles.js sample error_if_found
do
	echo 'Retrying DL sample'
	sleep 5
done

echo 'DL preview'
until node dist/bin/downloadfiles.js preview error_if_found
do
	echo 'Retrying DL preview'
	sleep 5
done
