
import { request, Agent, RequestOptions } from 'https';
import { IncomingMessage } from 'http';

const agent = new Agent({ keepAlive: true });

export function requestPromise(url: string, options: RequestOptions): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
    	request(url, { agent, ...options }, resolve).on('error', reject).end();
    });
}

export async function requestPromiseReadBody(url: string, options: RequestOptions): Promise<string> {
    const res = await requestPromise(url, options);

    return new Promise((resolve) => {
        const data: string[] = [];
        res.on('data', (d) => {
            data.push(d);
        });
        res.on('end', () => {
            resolve(data.join(''));
        });
    });
}
