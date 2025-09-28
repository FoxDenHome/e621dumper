import { readFileSync, writeFileSync } from 'fs';
import { TagType, APIPost, APINestedTags, ESPost, TagClass, tagTypeMap } from '../lib/types';
import { getNumericValue } from '../lib/utils';
import { requestPromiseReadBody } from '../lib/http';
import { client } from '../lib/esclient';

const config = require('../../config.json');
const MAX_ID_PATH = config.maxIdPath;

const POST_AGE_MIN_MS = Number.parseInt(process.env.FETCHNEW_POST_AGE_MIN_SECONDS ?? '86400', 10) * 1000;

interface PostPage {
	items: ESPost[];
	minId: number;
}

interface ESBulkOperation {
	update: {
		_id: string;
		_index: 'e621posts';
		retry_on_conflict: number;
	};
}

interface ESPostDoc {
	doc_as_upsert: true;
	doc: ESPost;
}

type ESQueueEntry = ESPostDoc | ESBulkOperation;

function fixArray(a?: string[] | string, s: string = ' ') {
	if (a) {
		if (typeof a === 'string') {
			a = a.split(s);
		}
		return Array.from(new Set(a));
	}
	return [];
}

function fixTags(v: ESPost | APIPost, name: TagClass) {
	const a = v[name];
	v[name] = [];
	for (const typ of tagTypeMap) {
		(v as any)[`${name}_${typ}`] = [];
	}
	if (!a) {
		return;
	}

	if ((a as string[] | string).length) {
		v[name] = fixArray(<string[] | string>a, ' ');
		return;
	}

	for (const typ of <TagType[]>Object.keys(a)) {
		fixTagsSub((a as APINestedTags)[typ]!, v, `${name}_${typ}`, name);
	}
}

function fixTagsSub(a: string[], v: APIPost | ESPost, name: string, gname: TagClass) {
	a = fixArray(a, ' ');

	const vany = (v as any);

	if (!vany[name]) {
		vany[name] = [];
	}

	for(const t of a) {
		(vany[name] as string[]).push(t);
		(v[gname] as string[]).push(t);
	}
}

function fixFile(v: APIPost | ESPost, p: 'file' | 'sample' | 'preview') {
	const va = v as APIPost;
	const ve = v as any;
	ve[`${p}_url`] = va[p].url
	ve[`${p}_size`] = va[p].size;
	ve[`${p}_height`] = va[p].height;
	ve[`${p}_width`] = va[p].width;
	delete va[p];
}

function normalizer(v: ESPost | APIPost): ESPost {
	// Uniq sources
	const s = v.sources || [];
	if (v.source) {
	        s.push(v.source);
	}
	delete v.source;
	const sU = new Set(s);
	v.sources = Array.from(sU);

	fixTags(v, 'tags');
	fixTags(v, 'locked_tags');

	fixFile(v, 'file');
	fixFile(v, 'sample');
	fixFile(v, 'preview');

	const va = v as any;
	va.score = va.score.total;

	// Fix arrays that are just strings...
	v.children = fixArray(v.children, ',');

	// Fix date
	v.created_at = new Date(v.created_at).toISOString();

	return v as ESPost;
}

async function getPage(beforeId?: number): Promise<PostPage> {
	const res = await requestPromiseReadBody('https://e621.net/posts.json?limit=320&typed_tags=1' + (beforeId ? `&tags=id:<${beforeId}` : ''), {
		auth: `${config.apiUser}:${config.apiKey}`,
		headers: { 'User-Agent': 'e621dumper (Doridian)' },
		timeout: 10000,
	});
	const body = JSON.parse(res).posts;
	if (body.length < 1) {
		return {
			items: [],
			minId: 0,
		};
	}

	const items = body.map((v: APIPost) => normalizer(v));

	let minId = items[0].id;
	for (const item of items) {
		const id = item.id;
		if (id < minId) {
			minId = id;
		}
	}

	return {
		items,
		minId,
	};
}

async function getPageWithRetry(retries: number, beforeId?: number): Promise<PostPage> {
	for (let i = 1; i < retries; i++) {
		try {
			const res = await getPage(beforeId);
			return res;
		} catch (e) {
			console.error(e);
		}
	}
	return getPage(beforeId);
}

async function main() {
	let maxId = -1;
	try {
		maxId = parseInt(readFileSync(MAX_ID_PATH).toString('utf8').trim(), 10);
	} catch (e) {
		console.error('Error loading maxId file:', (e as Error).stack || e);
	}

	if (maxId <= 0) {
		const maxIdRes = await client.search({
			index: 'e621posts',
			aggregations: {
				max_id: {
					max: {
						field: 'id',
					},
				},
			},
		});
		maxId = getNumericValue(maxIdRes!.aggregations!.max_id);
	}

	console.log(`Starting with maxId = ${maxId}`);

	let _maxId = maxId;

	let beforeId = undefined;
	while (true) {
		console.log(`Asking with beforeId = ${beforeId}`);
		const data: PostPage = await getPageWithRetry(3, beforeId);
		console.log('Got answer. Inserting into DB...');
		if (data.items.length < 1) {
			console.log('Exhausted pages!');
			break;
		}

		const pageQueue: ESQueueEntry[] = [];

		let skipCount = 0;

		for (const item of data.items) {
			if (Date.now() - (new Date(item.created_at).getTime()) < POST_AGE_MIN_MS) {
				skipCount++;
				continue;
			}

			pageQueue.push({
				update: {
					_id: item.id.toString(10),
					_index : 'e621posts',
					retry_on_conflict: 3,
				},
			});
			pageQueue.push({
				doc: item,
				doc_as_upsert: true,
			});

			if (item.id > _maxId) {
				_maxId = item.id;
			}
		}

		console.log(`Skipped ${skipCount} posts due to age`);

		if (pageQueue.length <= 0) {
			console.log('Empty batch! Going to next page...');
		} else {
			const result = await client.bulk({
				body: pageQueue,
			});

			if (result.errors) {
				throw new Error(JSON.stringify(result));
			}
		}

		if (data.minId <= maxId) {
			console.log('Done!');
			break;
		}
		beforeId = data.minId;
	}

	writeFileSync(MAX_ID_PATH, _maxId.toString());
}

async function safeMain() {
	try {
		await main();
	} catch(e) {
		console.error(e);
		process.exit(1);
	}
}

safeMain();
