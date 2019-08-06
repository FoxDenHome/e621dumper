module.exports = {
	elasticsearch: {
		node: 'http://localhost:9200',
		maxRetries: 5,
		requestTimeout: 60000,
		sniffOnStart: true,
	},
	rootdir: '/mnt/hdd/files/',
	maxParallel: 16,
};
