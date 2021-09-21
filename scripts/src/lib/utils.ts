import { dirname, normalize } from 'path';

import { mkdirSync } from 'fs';

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
		switch ((e as any).code) {
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
