'use strict';

const config = require('./config.js');

const { Client } = require('@elastic/elasticsearch');
const request = require('request-promise');
const fs = require('fs');

const MAX_ID_PATH = `${__dirname}/e621.maxid`;

const tMap = ['general', 'artist', 'unknown', 'copyright', 'character', 'species'];

const client = new Client(config.elasticsearch);

function fixArray(a, s) {
	if (a) {
		if (typeof a === 'string') {
			a = a.split(s);
		}
		return Array.from(new Set(a));
	}
	return [];
}

function fixTags(v, name) {
	const a = v[name];
	v[name] = [];
	for (const typ of tMap) {
		v[`${name}_${typ}`] = [];
	}
	if (!a) {
		return;
	}

	if (isFinite(a.length)) {
		v[name] = fixArray(a, ' ');
		return;
	}

	for (const typ of Object.keys(a)) {
		fixTagsSub(a[typ], v, `${name}_${typ}`, name);
	}
}

function fixTagsSub(a, v, name, gname) {
	a = fixArray(a, ' ');

	for(const t of a) {
		v[name].push(t);
		v[gname].push(t);
	}
}

function normalizer(v) {
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

	// Fix arrays that are just strings...
	v.children = fixArray(v.children, ',');

	// Fix date
	v.created_at = new Date((v.created_at.s * 1000) + (v.created_at.n / 1000000)).toISOString();

	return v;
}

async function getPage(beforeId) {
	const res = await request('https://e621.net/post/index.json?limit=320&typed_tags=1' + (beforeId ? `&before_id=${beforeId}` : ''), {
		headers: { 'User-Agent': 'e621updater (Doridian)' },
	});
	const body = JSON.parse(res);
	const items = body.map(v => normalizer(v));

	let minId = items[0].id, maxId = items[0].id;
	for (const item of items) {
		const id = item.id;
		if (id < minId) {
			minId = id;
		}
		if (id > maxId) {
			maxId = id;
		}
	}

	return {
		items,
		minId,
		maxId,
	};
}

async function main() {
	let maxId = -1;
	try {
		maxId = parseInt(fs.readFileSync(MAX_ID_PATH));
	} catch { }

	if (maxId <= 0) {
		const maxIdRes = await client.search({
			index: 'e621posts',
			body: {
				aggs: {
					max_id: {
						max: {
							field: 'id',
						},
					},
				},
			},
		});
		maxId = maxIdRes.body.aggregations.max_id.value;
	}

	console.log(`Starting with maxId = ${maxId}`);

	let _maxId = maxId;

	let beforeId = undefined;
	while (true) {
		console.log(`Asking with beforeId = ${beforeId}`);
		const data = await getPage(beforeId);

		if (data.maxId > _maxId) {
			_maxId = data.maxId;
		}

		for (const item of data.items) {
			await client.update({
				index: 'e621posts',
				id: item.id,
				body: {
					doc: item,
					doc_as_upsert: true,
				},
			});
		}

		if (data.minId <= maxId) {
			console.log('Done!');
			break;
		}
		beforeId = data.minId;
	}

	fs.writeFileSync(MAX_ID_PATH, _maxId);
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
