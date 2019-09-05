import { Client } from '@elastic/elasticsearch';
import { Agent, request } from 'https';
import { mkdirpFor, pathFixer } from '../lib/utils';
import { stat, createWriteStream } from 'fs';
import { ESItem, ESPost, FileDeletedKeys, FileDownloadedKeys, FileURLKeys, FileSizeKeys } from '../lib/types';

const config = require('../../config.json');

interface QueueEntry {
	url?: string,
	size: number,
	id: string,
	downloaded: boolean,
	deleted: boolean,
	dest: string,
};

const queue: QueueEntry[] = [];
let doneCount = 0, errorCount = 0, successCount = 0, skippedCount = 0, foundCount = 0, totalCount = 0;

const agent = new Agent({ keepAlive: true });

const DOWNLOAD_KIND = process.argv[2] || 'file';
const DEST_FOLDER = config.rootdir;

const RECHECK_ALL = process.argv[3] === 'force';
const EXIT_ERROR_IF_FOUND = process.argv[3] === 'error_if_found';

const DOWNLOADED_KEY: FileDownloadedKeys = <FileDownloadedKeys>`${DOWNLOAD_KIND}_downloaded`;
const DELETED_KEY: FileDeletedKeys = <FileDeletedKeys>`${DOWNLOAD_KIND}_deleted`;
const URL_KEY: FileURLKeys = <FileURLKeys>`${DOWNLOAD_KIND}_url`;
const SIZE_KEY: FileSizeKeys = <FileSizeKeys>`${DOWNLOAD_KIND}_size`;

let inProgress = 0;
let MAX_PARALLEL = config.maxParallel;
let esDone = false;

const client = new Client(config.elasticsearch);

const mustNot = [
	{ term: { [DELETED_KEY]: true } },
];

const RES_SKIP = 'skipped';

const gotFiles = new Set();

if (!RECHECK_ALL) {
	mustNot.push({ term: { [DOWNLOADED_KEY]: true } });
}

function setHadErrors() {
	process.exitCode = 1;
}

function printStats() {
	console.log('Total: ', totalCount, 'Queue: ', queue.length, 'Done: ', doneCount, 'Success: ', successCount, 'Failed: ', errorCount, 'Skipped: ', skippedCount, 'Percent: ', Math.floor((doneCount / totalCount) * 100));
}
printStats();
let scanInterval: NodeJS.Timeout | undefined = setInterval(printStats, 10000);

function checkEnd() {
	if (queue.length === 0 && esDone && scanInterval !== undefined) {
		clearInterval(scanInterval);
		scanInterval = undefined;
	}
}

function addURL(item: ESItem) {
	const url = item._source[URL_KEY];

	const file: QueueEntry = {
		url,
		size: item._source[SIZE_KEY] || 0,
		id: item._id,
		downloaded: item._source[DOWNLOADED_KEY],
		deleted: item._source[DELETED_KEY],
		dest: url ? (DEST_FOLDER + pathFixer(url.replace(/^https?:\/\//, ''))) : '',
	};

	if (!file.dest || gotFiles.has(file.dest)) {
		inProgress++;
		downloadDone(file, RES_SKIP);
		return;
	}
	gotFiles.add(file.dest);

	mkdirpFor(file.dest);

	stat(file.dest, (err, stat) => {
		if (err && err.code !== 'ENOENT') {
			console.error(err);
			return;
		}
		if (stat && (stat.size === file.size || file.size <= 0)) {
			inProgress++;
			downloadDone(file, RES_SKIP);
			return;
		}
		queue.push(file);
		downloadNext();
	});
}

function downloadDone(file: QueueEntry, success: boolean | 'skipped', fileDeleted = false) {
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

	const docBody: Partial<ESPost> = {};
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
	}, (err) => {
		if (!err) {
			return;
		}
		console.error(err);
		setHadErrors();
	});

}

function downloadNext() {
	checkEnd();

	if (inProgress >= MAX_PARALLEL) {
		return;
	}

	const file = queue.pop();
	if (!file) {
		return;
	}
	inProgress++;

	const out = createWriteStream(file.dest);
	request(file.url!, { agent }, (res) => {
		if (res.statusCode === 404) {
			downloadDone(file, false, true);
			return;
		}
		if (res.statusCode !== 200) {
			downloadDone(file, false);
			console.error('Bad status code ', res.statusCode, ' on ', file.url);
			setHadErrors();
			return;
		}
		res.pipe(out);
		out.on('finish', () => {
			if (file.size <= 0) {
				downloadDone(file, true);
				return;
			}

			stat(file.dest, (err, stat) => {
				const success = !err && stat && stat.size === file.size;
				if (!success) {
					setHadErrors();
				}
				downloadDone(file, success);
			});
		});
	}).on('error', (e) => {
		downloadDone(file, false);
		console.error('Error ', e, ' on ', file.url);
		setHadErrors();
	}).end();
}

client.search({
	index: 'e621posts',
	scroll: '10s',
	body: {
		size: 100,
		query: {
			bool: {
				must_not: mustNot,
				must: { exists: { field: URL_KEY } },
			},
		},
	},
}, function getMoreUntilDone(error, response) {
	if (error) {
		console.error(error);
		setHadErrors();
		return;
	}

	// collect all the records
	response.body.hits.hits.forEach((hit: ESItem) => {
		if (EXIT_ERROR_IF_FOUND) {
			process.exitCode = 2;
		}
		foundCount++;
		addURL(hit);
	});

	totalCount = response.body.hits.total.value;

	if (response.body.hits.total.value !== foundCount) {
		client.scroll({
			scroll_id: response.body._scroll_id,
			scroll: '10s',
		}, getMoreUntilDone);
	} else {
		console.log('ES all added', foundCount);
		esDone = true;
		checkEnd();
	}
});

