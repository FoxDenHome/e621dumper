const fs = require('fs');
const https = require('https');
const {
  Worker, isMainThread, parentPort, workerData
} = require('worker_threads');

const queue = [];

const agent = new https.Agent({ keepAlive: true });

let atEnd = false;
let inProgress = 0;
let MAX_PROGRESS = 1;

parentPort.on('message', (msg) => {
	if (msg === 'END') {
		atEnd = true;
		if (inProgress === 0) {
			process.exit(0);
		}
		return;
	}

	queue.push(msg);
	downloadNext();
});

function post(success) {
	inProgress--;
	parentPort.postMessage(success);
	downloadNext();
}

function downloadNext() {
	if (inProgress >= MAX_PROGRESS) {
		return;
	}

	const file = queue.pop();
	if (!file) {
		if (atEnd && inProgress === 0) {
			process.exit(0);
		}
		return;
	}
	inProgress++;

	const out = fs.createWriteStream(file.dest);
	https.request(file.url, { agent }, (res) => {
		res.pipe(out);
		out.on('finish', () => {
			post(true);
		});
	}).on('error', (e) => {
		post(false);
		console.error(e);
	}).end();
}
