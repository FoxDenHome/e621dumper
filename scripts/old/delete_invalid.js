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

async function main() {
	while (true) {
		const res = await client.search({
			index: 'e621posts',
			size: 1000,
			body: {
				query: {
					bool: {
						must: { exists: { field: 'locked_tags_0' } },
					},
				},
			},
		});

		const items = res.body.hits.hits;
		if (items.length < 1) {
			return;
		}

		for (const item of items) {
			await client.delete({
				index: 'e621posts',
				id: item._id,
			});
		}
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
