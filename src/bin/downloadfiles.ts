import { Client } from '@elastic/elasticsearch';
import { getNumericValue, mkdirpFor, pathFixer } from '../lib/utils';
import { stat, readFile, readdir } from 'fs/promises';
import { createWriteStream } from 'fs';
import { ESItem, ESPost, FileDeletedKeys, FileDownloadedKeys, FileURLKeys, FileSizeKeys } from '../lib/types';
import { ArgumentParser } from 'argparse';
import { SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import { request, Agent } from 'https';
import { IncomingMessage } from 'http';
import { EventEmitter } from 'stream';
import { basename } from 'path';

const argParse = new ArgumentParser({
	description: 'e621 downloadfiles'
});
argParse.add_argument('-t', '--type');
argParse.add_argument('-l', '--looper', { action: 'store_true' });
argParse.add_argument('-p', '--pauser'); 
const ARGS = argParse.parse_args();

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

const DOWNLOAD_KIND = ARGS.type;
const DEST_FOLDER = config.rootdir;

const EXIT_ERROR_IF_FOUND = !!ARGS.looper;

const DOWNLOADED_KEY: FileDownloadedKeys = <FileDownloadedKeys>`${DOWNLOAD_KIND}_downloaded`;
const DELETED_KEY: FileDeletedKeys = <FileDeletedKeys>`${DOWNLOAD_KIND}_deleted`;
const URL_KEY: FileURLKeys = <FileURLKeys>`${DOWNLOAD_KIND}_url`;
const SIZE_KEY: FileSizeKeys = <FileSizeKeys>`${DOWNLOAD_KIND}_size`;

let inProgress = 0;
let MAX_PARALLEL = config.maxParallel;
let esDone = false;

let downloadsPaused = false;
let pauserInterval: NodeJS.Timeout | undefined = undefined;
if (ARGS.pauser) {
	pauserInterval = setInterval(async () => {
		const data = await readFile(ARGS.pauser, { encoding: 'ascii' });
		const newDownloadsPaused = data.toLowerCase().includes('pause');
		if (downloadsPaused !== newDownloadsPaused) {
			downloadsPaused = newDownloadsPaused;
			console.log('Setting pause mode to', downloadsPaused);
		}
	}, 1000);
}

const client = new Client(config.elasticsearch);

const mustNot = [
	{ term: { [DELETED_KEY]: true } },
	{ term: { [DOWNLOADED_KEY]: true } },
];

const RES_SKIP = 'skipped';

const gotFiles = new Set<string>();
const listedFiles = new Map<string, Set<string>>();

function setHadErrors() {
	process.exitCode = 1;
}

function printStats() {
	console.log('Paused: ', downloadsPaused, 'Total: ', totalCount, 'Queue: ', queue.length, 'Done: ', doneCount, 'Success: ', successCount, 'Failed: ', errorCount, 'Skipped: ', skippedCount, 'Percent: ', Math.floor((doneCount / totalCount) * 100));
}
printStats();
let scanInterval: NodeJS.Timeout | undefined = setInterval(printStats, 10000);

function checkEnd() {
	if (queue.length === 0 && esDone) {
		if (scanInterval) {
			clearInterval(scanInterval);
			scanInterval = undefined;
		}
		if (pauserInterval) {
			clearInterval(pauserInterval);
			pauserInterval = undefined;
		}
	}
}

async function addURL(item: ESItem) {
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
		await downloadDone(file, RES_SKIP);
		return;
	}
	gotFiles.add(file.dest);

	const dir = mkdirpFor(file.dest);

	let fileSet = listedFiles.get(dir);
	if (!fileSet) {
		fileSet = new Set<string>();
		for (const file of await readdir(dir)) {
			fileSet.add(file);
		}
		listedFiles.set(dir, fileSet);
	}

	if (fileSet.has(basename(file.dest))) {
		try {
			const stat_res = await stat(file.dest);
			if (stat_res && (stat_res.size === file.size || file.size <= 0)) {
				inProgress++;
				await downloadDone(file, RES_SKIP);
				return;
			}
		} catch (err) {
			if ((err as any).code !== 'ENOENT') {
				console.error(err);
				return;
			}
		}
	}

	queue.push(file);
	setImmediate(downloadNext);
}

async function downloadDone(file: QueueEntry, success: boolean | 'skipped', fileDeleted = false) {
	if (success === RES_SKIP) {
		skippedCount++;
	} else if (success) {
		successCount++;
	} else {
		errorCount++;
	}
	doneCount++;
	inProgress--;

	setImmediate(downloadNext);

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

	try {
		await client.update({
			index: 'e621posts',
			id: file.id,
			body: {
				doc: docBody,
			},
		});
	} catch (err) {
		console.error(err);
		setHadErrors();
	}
}

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitWhilePaused() {
	while (downloadsPaused) {
		await delay(1000);
	}
}

function requestPromise(url: string): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
    	request(url, { agent }, resolve).on('error', reject).end();
    });
}

function waitOnEvent(obj: EventEmitter, event: string): Promise<void> {
	return new Promise((resolve) => {
		obj.once(event, resolve);
	});
}

async function downloadNext() {
	checkEnd();

	if (inProgress >= MAX_PARALLEL) {
		return;
	}

	const file = queue.pop();
	if (!file) {
		return;
	}
	inProgress++;

	await waitWhilePaused();

	const out = createWriteStream(file.dest);

	try {
		const res = await requestPromise(file.url!);

		if (res.statusCode === 404) {
			await downloadDone(file, false, true);
			return;
		}

		if (res.statusCode !== 200) {
			console.error('Bad status code ', res.statusCode, ' on ', file.url);
			setHadErrors();
			await downloadDone(file, false);
			return;
		}

		res.pipe(out);

		await waitOnEvent(out, 'finish');

		if (file.size <= 0) {
			await downloadDone(file, true);
			return;
		}

		let success = false;
		try {
			const stat_res = await stat(file.dest);
			success = stat_res && stat_res.size === file.size;
		} catch {
			success = false;
		}
		if (!success) {
			setHadErrors();
		}
		await downloadDone(file, success);
	} catch (e) {
		console.error('Error ', e, ' on ', file.url);
		setHadErrors();
		await downloadDone(file, false);
	}
}

async function getMoreUntilDone(response: SearchResponse): Promise<boolean> {
	// collect all the records
	for (const hit of response.hits.hits) {
		foundCount++;
		await addURL(hit as ESItem);
	}

	if (foundCount > 0 && EXIT_ERROR_IF_FOUND && !process.exitCode) {
		process.exitCode = 2;
	}

	totalCount = getNumericValue(response.hits.total);

	if (totalCount === foundCount) {
		console.log('ES all added', foundCount);
		esDone = true;
		checkEnd();
		return false;
	}

	return true;
}

async function main() {
	let response = await client.search({
		index: 'e621posts',
		scroll: '60s',
		body: {
			size: 100,
			query: {
				bool: {
					must_not: mustNot,
					must: { exists: { field: URL_KEY } },
				},
			},
		},
	});

	while (await getMoreUntilDone(response)) {
		response = await client.scroll({
			scroll_id: response._scroll_id,
			scroll: '60s',
		});
	}
}

main().catch(e => console.error(e.stack || e));
