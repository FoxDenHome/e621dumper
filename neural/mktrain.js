'use strict';

const { Client } = require('@elastic/elasticsearch');
const { spawnSync } = require('child_process');

const client = new Client({
	node: 'http://localhost:9200',
	maxRetries: 5,
	requestTimeout: 60000,
	sniffOnStart: true
});

let gotCount = 0;

let trainingCount = 1000;
let verifyCount = 300;

let neededCount = trainingCount + verifyCount;

const okayExtensions = ['jpg', 'jpeg', 'png', 'bmp'];

function addFile(item, cls) {
	if (gotCount >= neededCount) {
		return;
	}

	const data = item._source;
	const ext = data.file_url.replace(/^.*\./g, '').toLowerCase();
	if (!okayExtensions.includes(ext)) {
		return;
	}

	gotCount++;

	const folder = './data/' + ((gotCount > trainingCount) ? 'validation' : 'train') + `/${cls}`;

	const src = '/mnt/hdd/dumps/e621/' + data.file_url.replace(/^https?:\/\//, '');
	const dest = `${folder}/${item._id}.${ext}`;

	try {
		if (fs.statSync(dest)) {
			return;
		}
	} catch { }

	spawnSync('mkdir', ['-p', folder]);
	spawnSync('convert', [src, '-resize', '300x300', '-gravity', 'center', '-background', 'black', '-extent', '300x300', dest], { stdio: 'inherit' });
}

const cls = process.argv[2];

client.search({
	index: 'e621posts',
	scroll: '10s',
	body: {
		query: {
			bool: {
				must: [
					{ term: { file_downloaded: true } },
					{ term: { tags_general: 'solo' } },
					{ term: { tags_species: cls } },
				],
			},
		},
	},
}, function getMoreUntilDone(error, response) {
	if (error) {
		console.error(error.meta.body.error);
		return;
	}

	// collect all the records
	response.body.hits.hits.forEach((item) => addFile(item, cls));

	console.log(gotCount, response.body.hits.total.value);

	if (response.body.hits.total.value !== gotCount && gotCount < neededCount) {
	// now we can call scroll over and over
		client.scroll({
			scrollId: response.body._scroll_id,
			scroll: '10s'
		}, getMoreUntilDone);
	} else {
		console.log('ES all added', gotCount);
	}
});
