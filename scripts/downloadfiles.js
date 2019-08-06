'use strict';

const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const https = require('https');

const queue = [];
let doneCount = 0, errorCount = 0, successCount = 0, skippedCount = 0, foundCount = 0, totalCount = 0;

const agent = new https.Agent({ keepAlive: true });

const DOWNLOAD_KIND = process.argv[2] || 'file';
const DEST_FOLDER = '/mnt/hdd/files/';

const RECHECK_ALL = process.argv[3] === 'force';

const DOWNLOADED_KEY = `${DOWNLOAD_KIND}_downloaded`;
const DELETED_KEY = `${DOWNLOAD_KIND}_deleted`;
const URL_KEY = `${DOWNLOAD_KIND}_url`;
const SIZE_KEY = `${DOWNLOAD_KIND}_size`;

let inProgress = 0;
let MAX_PROGRESS = 64;
let esDone = false;

function printStats() {
	console.log('Total: ', totalCount, 'Queue: ', queue.length, 'Done: ', doneCount, 'Success: ', successCount, 'Failed: ', errorCount, 'Skipped: ', skippedCount, 'Percent: ', Math.floor((doneCount / totalCount) * 100));
}
printStats();
let scanInterval = setInterval(printStats, 10000);

function checkEnd() {
	if (queue.length === 0 && esDone && scanInterval !== undefined) {
		clearInterval(scanInterval);
		scanInterval = undefined;
	}
}

const RES_SKIP = 'skipped';

function addURL(item) {
	const file = {
		dest: DEST_FOLDER + item._source[URL_KEY].replace('https://', ''),
		url: item._source[URL_KEY],
		size: item._source[SIZE_KEY],
		id: item._id,
		downloaded: item._source[DOWNLOADED_KEY],
		deleted: item._source[DELETED_KEY],
	};

	if (file.url === 'https://static1.e621.net/images/download-preview.png') {
		inProgress++;
		downloadDone(file, RES_SKIP);
		return;
	}

	fs.stat(file.dest, (err, stat) => {
		if (err && err.code !== 'ENOENT') {
			return;
		}
		if (stat && stat.size === file.size) {
			inProgress++;
			downloadDone(file, RES_SKIP);
			return;
		}
		queue.push(file);
		downloadNext();
	});
}

function downloadDone(file, success, fileDeleted) {
	if (success === RES_SKIP) {
		skippedCount++;
	} else if (success) {
		successCount++;
	} else {
		errorCount++;
	}
	doneCount++;
	inProgress--;

	downloadNext();

	const docBody = {};
	if (success) {
		if (file.downloaded) {
			return;
		}
		docBody[DOWNLOADED_KEY] = true;
	} else if (fileDeleted) {
		if (file.deleted) {
			return;
		}
		docBody[DELETED_KEY] = true;
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

const mustNot = [
	{ term: { [DELETED_KEY]: true } },
];

if (!RECHECK_ALL) {
	mustNot.push({ term: { [DOWNLOADED_KEY]: true } });
}

client.search({
	index: 'e621posts',
	scroll: '10s',
	body: {
		size: 100,
		query: {
			bool: {
				must_not: mustNot,
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

