const { mkdirSync } = require('fs');
const { normalize, dirname } = require('path');

const madeDirs = new Set();

export function mkdirpFor(file: string) {
	return mkdirp(dirname(file));
}

export function mkdirp(dir: string) {
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

export function pathFixer(path: string) {
	path = normalize(path);
	if (path.startsWith('.') || path.startsWith('/')) {
		path = '_' + path;
	}
	return path;
}
