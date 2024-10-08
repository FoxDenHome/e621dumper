import * as express from 'express';

import { Client } from '@elastic/elasticsearch';
import { URL } from 'url';

const config = require('../../config.json');

const app = express();
const client = new Client(config.elasticsearch);

app.use(express.text({type: '*/*'}));

const PORT = Number.parseInt(process.env.PORT ?? '8001', 10);
const { URL_HOST, URL_PROTOCOL } = process.env;
const URL_FILES_PATH = process.env.URL_FILES_PATH ?? '/files';

app.use('/files', express.static(config.rootdir));

function filterURL(container: any, field: string, req: express.Request) {
    if (container[field]) {
        const url = new URL(container[field]);
        url.pathname = `${URL_FILES_PATH}/${url.host}${url.pathname}`;
        if (URL_HOST) {
            url.host = URL_HOST;
        } else {
            url.hostname = req.hostname;
            url.port = `${PORT}`;
        }
        url.protocol = URL_PROTOCOL ?? req.protocol;
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
    const size = req.query.size ? Number.parseInt(req.query.size.toString(), 10) : 100;
    const from = req.query.from ? Number.parseInt(req.query.from.toString(), 10) : 0;

    if (size < 1 || size > 1000) {
        throw new Error('Invalid size');
    }
    if (from < 0) {
        throw new Error('Invalid from');
    }

    if (Object.keys(query).length < 1) {
        query.match_all = {};
    }

    const res = await client.search({
        index: 'e621posts',
        body: {
            size,
            from,
            query,
        },
    });

    return res.hits.hits.map((hit: any) => filterESHit(hit, req));
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

function addNegatableTerms(query: any, field: string, terms: string[] | string) {
    const posTerms: string[] = [];
    const negTerms: string[] = [];

    if (!Array.isArray(terms)) {
        terms = [terms];
    }

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
        addNegatableTerms(query, 'tags', req.query.tags as string[] | string);
    }
    try {
        res.send(await processSearch(query, req));
    } catch (error) {
        res.status(400).send({ error: 'Search error' });
        console.warn(`Search error: ${error}`);
    }
});

app.post('/api/v1/posts', async (req: express.Request, res: express.Response) => {
    try {
        const query = JSON.parse(req.body as string) as Record<string, unknown>;
        res.send(await processSearch(query, req));
    } catch (error) {
        res.status(400).send({ error: 'Search error' });
        console.warn(`Search error: ${error}`);
    }
});

app.get('/api/v1/healthcheck', async (_: express.Request, res: express.Response) => {
    res.send({ ok: true });
});

app.listen(PORT, () => console.log('e621dumper API online'));

process.on('SIGTERM', () => {
    process.exit(0);
});

process.on('SIGINT', () => {
    process.exit(0);
});
