import { ClientRequestArgs } from 'node:http';
import {
    ConnectionRequestOptions,
    ConnectionRequestParams,
    Client as ESClient,
    HttpConnection,
} from '@elastic/elasticsearch';

const UNIX_SOCKET_PATH = process.env.ES_UNIX_SOCKET_PATH ?? '';

class UDSConnection extends HttpConnection {
    public override buildRequestObject(
        params: ConnectionRequestParams,
        options: ConnectionRequestOptions,
    ): ClientRequestArgs {
        const request = super.buildRequestObject(params, options);
        if (UNIX_SOCKET_PATH) {
            request.socketPath = UNIX_SOCKET_PATH;
        }
        return request;
    }
}

export const client = new ESClient({
    node: process.env.ES_URL,
    Connection: UDSConnection,
});
