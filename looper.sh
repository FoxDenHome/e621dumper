#!/bin/bash

echo 'Fetch'
until node dist/bin/fetchnew.js
do
	echo 'Retrying fetch'
	sleep 5
done

echo 'DL file'
until node dist/bin/downloadfiles.js --type=file --looper --pauser=/config/pauser
do
	echo 'Retrying DL file'
	sleep 5
done

echo 'DL sample'
until node dist/bin/downloadfiles.js --type=sample --looper --pauser=/config/pauser
do
	echo 'Retrying DL sample'
	sleep 5
done

echo 'DL preview'
until node dist/bin/downloadfiles.js --type=preview --looper --pauser=/config/pauser
do
	echo 'Retrying DL preview'
	sleep 5
done
