import { ClientRequestArgs } from 'node:http';
import { Client, Connection } from '@opensearch-project/opensearch';

const UNIX_SOCKET_PATH = process.env.OS_UNIX_SOCKET_PATH ?? '';

class UDSConnection extends Connection {
    public override buildRequestObject(params: unknown): ClientRequestArgs {
        const request = super.buildRequestObject(params);
        if (UNIX_SOCKET_PATH) {
            request.socketPath = UNIX_SOCKET_PATH;
        }
        return request;
    }
}

export const client = new Client({
    node: process.env.OS_URL,
    Connection: UDSConnection,
});
