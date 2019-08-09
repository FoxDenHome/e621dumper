"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { mkdirSync } = require('fs');
const { normalize, dirname } = require('path');
const madeDirs = new Set();
function mkdirpFor(file) {
    return mkdirp(dirname(file));
}
exports.mkdirpFor = mkdirpFor;
function mkdirp(dir) {
    dir = normalize(dir);
    if (madeDirs.has(dir)) {
        return;
    }
    try {
        mkdirSync(dir);
    }
    catch (e) {
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
exports.mkdirp = mkdirp;
function pathFixer(path) {
    path = normalize(path);
    if (path.startsWith('.') || path.startsWith('/')) {
        path = '_' + path;
    }
    return path;
}
exports.pathFixer = pathFixer;
//# sourceMappingURL=utils.js.map