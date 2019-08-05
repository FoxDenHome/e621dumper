'use strict';

const { Client } = require('@elastic/elasticsearch');
const request = require('request-promise');
const fs = require('fs');

const client = new Client({
	node: 'http://localhost:9200',
	maxRetries: 5,
	requestTimeout: 60000,
	sniffOnStart: true,
});

const startId = 1952209;

async function main() {
	let id = startId;

	let hadBad = true;
	for (let id = startId; hadBad && id > 0; id--) {
		const res = await client.search({
			index: 'e621posts',
			size: 1000,
			body: {
				query: {
					bool: {
						must: { term: { id } },
					},
				},
			},
		});

		const items = res.body.hits.hits;

		hadBad = false;
		for(const item of items) {
			const numericId = parseInt(item._id, 10);
			if (numericId <= 0 || !isFinite(numericId) || numericId !== item._source.id) {
				await client.delete({
					index: 'e621posts',
					id: item._id,
				});
				hadBad = true;
			}
		}
		if (hadBad) console.log(id);
		hadBad = id > 1852209;
	}
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
