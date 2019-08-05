const fs = require('fs');

const files = fs.readdirSync('../tags');

const tMap = ['general', 'artist', 'unknown', 'copyright', 'character', 'species'];

const tags = {};
for(const f of files) {
	const data = JSON.parse(fs.readFileSync(`../tags/${f}`));
	for(const d of data) {
		d.type = tMap[d.type];
		tags[d.name] = d;
	}
}
fs.writeFileSync('tags.json', JSON.stringify(tags));
