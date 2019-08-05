'use strict';

const fs = require('fs');
const tags = require('./tags.json');

const {
  Worker, isMainThread, parentPort, workerData
} = require('worker_threads');

function fixArray(a, s) {
	if (a) {
		return Array.from(new Set(a.split(s)));
	}
	return [];
}

function fixTags(v, name) {
	const a = fixArray(v[name], ' ');
	delete v[name];

	for(const t of a) {
		const tObj = tags[t] || {type: 'unknown'};
		const subName = `${name}_${tObj.type}`;
		let  subA = v[subName];
		if (!subA) {
			subA = [];
			v[subName] = subA;
		}
		subA.push(t);
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

	// Fix arrays that are just strings...
	fixTags(v, 'tags');
	fixTags(v, 'locked_tags');
	v.children = fixArray(v.children, ',');

	// Fix date
	v.created_at = new Date((v.created_at.s * 1000) + (v.created_at.n / 1000000)).toISOString();

	return v;
}

function convert(srcs, dest) {
	console.log(srcs);
	const out = [];

	for(const src of srcs) {
		const d = JSON.parse(fs.readFileSync(src)).map(normalizer);
		for (const v of d) {
			out.push({ index: { _index: 'e621posts', _id: v.id } });
			out.push(v);
		}
	}

	fs.writeFileSync(dest, out.map(x => JSON.stringify(x)).join('\n') + '\n');
}

if (isMainThread) {
	const files = fs.readdirSync('./posts');
	function spawnNew() {
		if (files.length > 0) {
			const fileSub = files.splice(0, 100);
			const worker = new Worker(__filename, { workerData: fileSub });
			worker.on('exit', spawnNew);
		}
	}

	for (let i = 0; i < 16; i++) {
		spawnNew();
	}
} else {
	convert(workerData.map(f => `./posts/${f}`), `./posts_bulk/${workerData[0]}`);
}
