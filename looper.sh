#!/bin/bash

echo 'Fetch'
until node dist/bin/fetchnew.js
do
	echo 'Retrying fetch'
	sleep 10
done

sleep 10
echo 'DL file'
until node dist/bin/downloadfiles.js --type=file --looper
do
	echo 'Retrying DL file'
	sleep 10
done

#sleep 10
# echo 'DL sample'
# until node dist/bin/downloadfiles.js --type=sample --looper
# do
# 	echo 'Retrying DL sample'
# 	sleep 10
# done

# sleep 10
# echo 'DL preview'
# until node dist/bin/downloadfiles.js --type=preview --looper
# do
# 	echo 'Retrying DL preview'
# 	sleep 10
# done
