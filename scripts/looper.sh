#!/bin/bash

echo 'Fetch'
until node fetchnew.js
do
	echo 'Retrying fetch'
	sleep 5
done

echo 'DL file'
until node downloadfiles.js file
do
	echo 'Retrying DL file'
	sleep 5
done

echo 'DL sample'
until node downloadfiles.js sample
do
	echo 'Retrying DL sample'
	sleep 5
done

echo 'DL preview'
until node downloadfiles.js preview
do
	echo 'Retrying DL preview'
	sleep 5
done
