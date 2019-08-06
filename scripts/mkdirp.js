'use strict';

const { mkdirSync } = require('fs');
const { normalize, dirname } = require('path');

const madeDirs = new Set();

function mkdirpFor(file) {
	return mkdirp(dirname(file));
}

function mkdirp(dir) {
	dir = normalize(dir);

	if (madeDirs.has(dir)) {
		return;
	}

	try {
		mkdirSync(dir);
	} catch (e) {
		if (e.code === 'ENOENT') {
			mkdirp(dirname(dir));
			mkdirSync(dir);
			return;
		}
		throw e;
	}

	madeDirs.add(dir);
}

module.exports = { mkdirp, mkdirpFor };
