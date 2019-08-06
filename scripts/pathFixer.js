'use strict';

const { normalize } = require('path');

function pathFixer(path) {
	path = normalize(path);
	if (path.startsWith('.') || path.startsWith('/')) {
		path = '_' + path;
	}
	return path;
}

module.exports = pathFixer;
