const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const {
  Worker, isMainThread, parentPort, workerData
} = require('worker_threads');

let esDone = false;
let doneCount = 0, errorCount = 0, successCount = 0, skippedCount = 0, foundCount = 0, totalCount = 0;

const WORKER_QUEUE = 5;

const queue = [];
const workers = [];

function scanMaxProc(reload) {
	if (reload) {
		const c = fs.readFileSync('./verifydump_maxproc').toString('utf8');
		const MAX_PROGRESS = parseInt(c.trim());
		console.log('Setting MAX_PROGRESS to', MAX_PROGRESS);
		while (workers.length < MAX_PROGRESS) {
			const worker = new Worker('./verifydump_child.js', { });
			workers.push(worker);
			worker.queue = 0;
			worker.on('message', (msg) => {
				doneCount++;
				if (msg) {
					successCount++;
				} else {
					errorCount++;
				}
				worker.queue--;
				downloadNext(worker);
			});

			downloadNext(worker);
		}

		while (workers.length > MAX_PROGRESS) {
			const worker = workers.pop();
			worker.postMessage('END');
		}
	}

	console.log('Total: ', totalCount, 'Queue: ', queue.length, 'Done: ', doneCount, 'Success: ', successCount, 'Failed: ', errorCount, 'Skipped: ', skippedCount, 'Percent: ', Math.floor((doneCount / totalCount) * 100));

}
scanMaxProc(true);
process.on('SIGUSR2', () => scanMaxProc(true));
setInterval(() => scanMaxProc(false), 10000);

function addURL(item) {
	const file = {
		dest: '/mnt/hdd/dumps/e621/' + item.file_url.replace('https://', ''),
		url: item.file_url,
		size: item.file_size,
	};

	fs.stat(file.dest, (err, stat) => {
		if (err && err.code !== 'ENOENT') {
			return;
		}
		if (stat && stat.size === file.size) {
			doneCount++;
			skippedCount++;
			return;
		}

		queue.push(file);
		downloadNext();
	});
}

function downloadNext(worker) {
	if (!worker) {
		for(const _worker of workers) {
			if (_worker.queue < WORKER_QUEUE) {
				worker = _worker;
				break;
			}
		}

		if (!worker) {
			return;
		}
	}

	while (worker.queue < WORKER_QUEUE) {
		const file = queue.pop();
		if (!file) {
			if (esDone) {
				workers.forEach(_worker => _worker.postMessage('END'));
			}
			break;
		}

		worker.queue++;
		worker.postMessage(file);
	}
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
		query: {
			"match_all": {}
		}
	}
}, function getMoreUntilDone(error, response) {
	// collect all the records
	response.body.hits.hits.forEach(function (hit) {
		foundCount++;
		addURL(hit._source);
	});

	totalCount = response.body.hits.total.value;

	if (response.body.hits.total.value !== foundCount) {
	// now we can call scroll over and over
		client.scroll({
			scrollId: response.body._scroll_id,
			scroll: '10s'
		}, getMoreUntilDone);
	} else {
		esDone = true;
		console.log('ES all added', foundCount);
	}
});

