import * as express from 'express';
import { Client } from '@elastic/elasticsearch';

const config = require('../../config.json');

const app = express();
const client = new Client(config.elasticsearch);

async function processSearch(query: any, req: express.Request) {
    const size = parseInt(req.query.limit, 10) || 100;

    return await client.search({
        index: 'e621posts',
        body: {
            size,
            query,
        },
    });
}

function addTerms(query: any, field: string, terms: string[], typ = 'must') {
    if (terms.length < 1) {
        return;
    }
    query.bool[typ].push({ terms: { [field]: terms } });
}

function addNegatableTerms(query: any, field: string, terms: string[]) {
    const posTerms: string[] = [];
    const negTerms: string[] = [];

    for (const term of terms) {
        if (term.startsWith('-')) {
            negTerms.push(term.substr(1));
        } else {
            posTerms.push(term);
        }
    }

    addTerms(query, field, posTerms, 'must');
    addTerms(query, field, negTerms, 'must_not');
}

app.get('/api/v1/posts', async (req, res) => {
    const query = {};
    if (req.query.tags) {
        addNegatableTerms(query, 'tags', req.query.tags.split(' '));
    }
    res.send(await processSearch(query, req));
});

app.post('/api/v1/posts', async (req, res) => {
    const query = JSON.parse(req.body);
    res.send(await processSearch(query, req));
});

app.listen(8001);
