import { getNumericValue, mkdirpFor, pathFixer } from '../lib/utils';
import { stat, readdir } from 'fs/promises';
import { createWriteStream } from 'fs';
import { ESItem, ESPost, FileDeletedKeys, FileDownloadedKeys, FileURLKeys, FileSizeKeys } from '../lib/types';
import { ArgumentParser } from 'argparse';
import { request, Agent } from 'https';
import { IncomingMessage } from 'http';
import { EventEmitter } from 'stream';
import { basename } from 'path';
import { client } from '../lib/osclient';
import { Core_Bulk } from '@opensearch-project/opensearch/api/_types';
import { Search_Response } from '@opensearch-project/opensearch/api';

const argParse = new ArgumentParser({
	description: 'e621 downloadfiles'
});
argParse.add_argument('-t', '--type');
argParse.add_argument('-l', '--looper', { action: 'store_true' });
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

type OSBulkType = Core_Bulk.OperationContainer | Core_Bulk.UpdateAction;

const queue: QueueEntry[] = [];
let osQueue: OSBulkType[] = [];
let doneCount = 0, errorCount = 0, successCount = 0, skippedCount = 0, foundCount = 0, totalCount = 0, listCount = 0;

const agent = new Agent({ keepAlive: true });

const DOWNLOAD_KIND = ARGS.type;
const DEST_FOLDER = config.rootdir;
const MAX_PARALLEL = config.maxParallel;
const OS_BATCH_SIZE = config.osBatchSize;

const EXIT_ERROR_IF_FOUND = !!ARGS.looper;

const DOWNLOADED_KEY: FileDownloadedKeys = <FileDownloadedKeys>`${DOWNLOAD_KIND}_downloaded`;
const DELETED_KEY: FileDeletedKeys = <FileDeletedKeys>`${DOWNLOAD_KIND}_deleted`;
const URL_KEY: FileURLKeys = <FileURLKeys>`${DOWNLOAD_KIND}_url`;
const SIZE_KEY: FileSizeKeys = <FileSizeKeys>`${DOWNLOAD_KIND}_size`;

let inProgress = 0;
let esDone = false;

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
	console.log('Total:', totalCount, 'Queue:', queue.length, 'Done:', doneCount, 'Success:', successCount, 'Failed:', errorCount, 'Skipped:', skippedCount, 'DirList:', listCount, 'Percent:', Math.floor((doneCount / totalCount) * 100));
}
printStats();
let scanInterval: NodeJS.Timeout | undefined = setInterval(printStats, 10000);

const OS_BATCH_SIZE_2 = OS_BATCH_SIZE * 2;
async function osRunBatchUpdate(min: number) {
	if (osQueue.length < min) {
		return;
	}
	const todo = osQueue;
	osQueue = [];
	
	try {
		await client.bulk({
			body: todo,
		});
		console.log('Processed', todo.length / 2, 'batched updates');
	} catch (err) {
		console.error(err);
		setHadErrors();
	}
}

let batcherInterval: NodeJS.Timeout | undefined = setInterval(() => osRunBatchUpdate(OS_BATCH_SIZE_2), 1000);

async function checkEnd() {
	if (queue.length > 0 || inProgress > 0 || !esDone) {
		return;
	}

	if (scanInterval) {
		clearInterval(scanInterval);
		scanInterval = undefined;
	}

	if (batcherInterval) {
		clearInterval(batcherInterval);
		batcherInterval = undefined;
	}

	await osRunBatchUpdate(1);
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
		listCount++;
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

	osQueue.push({
		update: {
			_index: 'e621dumper_posts',
			_id: file.id,
		},
	}, {
		doc: docBody,
	});

	await checkEnd();
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
	if (inProgress >= MAX_PARALLEL) {
		return;
	}

	const file = queue.pop();
	if (!file) {
		return;
	}
	inProgress++;

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

async function getMoreUntilDone(response: Search_Response): Promise<boolean> {
	totalCount = getNumericValue(response.body.hits.total);

	if (totalCount > 0 && EXIT_ERROR_IF_FOUND && !process.exitCode) {
		process.exitCode = 2;
	}

	// collect all the records
	const promises: Promise<void>[] = [];
	for (const hit of response.body.hits.hits) {
		foundCount++;
		promises.push(addURL(hit as unknown as ESItem));
	}
	await Promise.all(promises);

	if (totalCount === foundCount) {
		console.log('ES all added', foundCount);
		esDone = true;
		await checkEnd();
		return false;
	}

	return true;
}

async function main() {
	let response = await client.search({
		index: 'e621dumper_posts',
		scroll: '60s',
		size: OS_BATCH_SIZE,
		body: {
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
			scroll_id: response.body._scroll_id,
			scroll: '60s',
		});
	}
}

main().catch(e => {
	console.error('ES scan error, setting early exit', e.stack || e);
	esDone = true;
	setHadErrors();
}).then(checkEnd);
