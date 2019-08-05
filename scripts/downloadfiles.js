'use strict';

const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const https = require('https');

const queue = [];
let doneCount = 0, errorCount = 0, successCount = 0, skippedCount = 0, foundCount = 0, totalCount = 0;

const agent = new https.Agent({ keepAlive: true });

let inProgress = 0;
let MAX_PROGRESS = 16;
let esDone = false;

function scanMaxProc(reload) {
	/*if (reload) {
		const c = fs.readFileSync('./verifydump_maxproc').toString('utf8');
		MAX_PROGRESS = parseInt(c.trim());
		console.log('Setting MAX_PROGRESS to', MAX_PROGRESS);
		for (let i = 0; i < MAX_PROGRESS; i++) {
			downloadNext();
		}
	}*/

	console.log('Total: ', totalCount, 'Queue: ', queue.length, 'Done: ', doneCount, 'Success: ', successCount, 'Failed: ', errorCount, 'Skipped: ', skippedCount, 'Percent: ', Math.floor((doneCount / totalCount) * 100));


}
scanMaxProc(true);
process.on('SIGUSR2', () => scanMaxProc(true));
let scanInterval = setInterval(() => scanMaxProc(false), 10000);

function checkEnd() {
	if (queue.length === 0 && esDone && scanInterval !== undefined) {
		clearInterval(scanInterval);
		scanInterval = undefined;
	}
}

function addURL(item) {
	const file = {
		dest: '/mnt/hdd/dumps/e621/' + item._source.file_url.replace('https://', ''),
		url: item._source.file_url,
		size: item._source.file_size,
		id: item._id,
	};

	fs.stat(file.dest, (err, stat) => {
		if (err && err.code !== 'ENOENT') {
			return;
		}
		if (stat && stat.size === file.size) {
			inProgress++;
			downloadDone(file, true);
			return;
		}
		queue.push(file);
		downloadNext();
	});
}

function downloadDone(file, success, fileDeleted) {
	if (success) {
		successCount++;
	} else {
		errorCount++;
	}
	doneCount++;
	inProgress--;

	downloadNext();

	const docBody = {};
	if (success) {
		docBody.file_downloaded = true;
		docBody.file_deleted = null;
	} else if (fileDeleted) {
		docBody.file_downloaded = null;
		docBody.file_deleted = true;
	} else {
		return;
	}

	client.update({
		index: 'e621posts',
		id: file.id,
		body: {
			doc: docBody,
		},
	}, (err, res) => {
		if (!err) {
			return;
		}
		console.error(err);
	});

}

function downloadNext() {
	checkEnd();

	if (inProgress >= MAX_PROGRESS) {
		return;
	}

	const file = queue.pop();
	if (!file) {
		return;
	}
	inProgress++;

	const out = fs.createWriteStream(file.dest);
	https.request(file.url, { agent }, (res) => {
		if (res.statusCode === 404) {
			downloadDone(file, false, true);
			return;
		}
		if (res.statusCode !== 200) {
			downloadDone(file, false);
			console.error('Bad status code ', res.statusCode, ' on ', file.url);
			return;
		}
		res.pipe(out);
		out.on('finish', () => downloadDone(file, true));
	}).on('error', (e) => {
		downloadDone(file, false);
		console.error('Error ', e, ' on ', file.url);
	}).end();
}

const client = new Client({
	node: 'http://localhost:9200',
	maxRetries: 5,
	requestTimeout: 60000,
	sniffOnStart: true
});


client.search({
	index: 'e621posts',
	scroll: '10s',
	body: {
		size: 100,
		query: {
			bool: {
				must_not: [
					{ term: { file_deleted: true } },
					{ term: { file_downloaded: true } },
				],
			},
		},
	},
}, function getMoreUntilDone(error, response) {
	if (error) {
		console.error(error.meta.body.error);
	}
	// collect all the records
	response.body.hits.hits.forEach(function (hit) {
		foundCount++;
		addURL(hit);
	});

	totalCount = response.body.hits.total.value;

	if (response.body.hits.total.value !== foundCount) {
		client.scroll({
			scrollId: response.body._scroll_id,
			scroll: '10s',
		}, getMoreUntilDone);
	} else {
		console.log('ES all added', foundCount);
		esDone = true;
		checkEnd();
	}
});

