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
		switch (e.code) {
			case 'ENOENT':
				mkdirp(dirname(dir));
				mkdirSync(dir);
				break;
			case 'EEXIST':
				break;
			default:
				throw e;
		}
	}

	madeDirs.add(dir);
}

module.exports = { mkdirp, mkdirpFor };
