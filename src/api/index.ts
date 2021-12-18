import * as express from 'express';

import { Client } from '@elastic/elasticsearch';
import { URL } from 'url';

const config = require('../../config.json');

const app = express();
const client = new Client(config.elasticsearch);

function filterURL(container: any, field: string, req: express.Request) {
    if (container[field]) {
        const url = new URL(container[field]);
        url.pathname = `/files/${url.host}${url.pathname}`;
        url.host = req.hostname;
        url.protocol = req.protocol;
        container[field] = url.href;
    }
}

function filterESHit(hit: any, req: express.Request): any {
    const source = hit._source;
    filterURL(source, 'file_url', req);
    filterURL(source, 'sample_url', req);
    filterURL(source, 'preview_url', req);
    return source;
}

async function processSearch(query: any, req: express.Request) {
    const size = req.query.limit ? parseInt(req.query.limit.toString(), 10) : 100;

    if (Object.keys(query).length < 1) {
        query.match_all = {};
    }

    const res = await client.search({
        index: 'e621posts',
        body: {
            size,
            query,
        },
    });

    return res.body.hits.hits.map((hit: any) => filterESHit(hit, req));
}

function addTerms(query: any, field: string, terms: string[], typ = 'must') {
    if (terms.length < 1) {
        return;
    }

    if (!query.bool) {
        query.bool = {};
    }

    if (!query.bool[typ]) {
        query.bool[typ] = [];
    }

    const qtyp = query.bool[typ];
    for (const term of terms) {
        qtyp.push({ term: { [field]: term } });
    }
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

app.get('/api/v1/posts', async (req: express.Request, res: express.Response) => {
    const query = {};
    if (req.query.tags) {
        addNegatableTerms(query, 'tags', req.query.tags.toString().split(' '));
    }
    res.send(await processSearch(query, req));
});

app.post('/api/v1/posts', async (req: express.Request, res: express.Response) => {
    const query = JSON.parse(req.body);
    res.send(await processSearch(query, req));
});

app.get('/api/v1/healthcheck', async (_: express.Request, res: express.Response) => {
    res.send({ ok: true });
});

app.listen(8001, () => console.log('e621dumper API online'));

process.on('SIGTERM', () => {
    process.exit(0);
});

process.on('SIGINT', () => {
    process.exit(0);
});
