/**
 * In-memory HTTP test client for Express apps.
 * Allows executing integration tests without binding to loopback TCP ports,
 * ensuring tests run seamlessly in restricted sandbox environments and CI.
 */

const http = require('http');
const { Readable } = require('stream');

function createTestClient(app) {
  function makeRequest(method, url) {
    let requestHeaders = {
      host: '127.0.0.1'
    };
    let payload = null;

    const caller = {
      set(header, value) {
        requestHeaders[header.toLowerCase()] = value;
        return caller;
      },
      send(data) {
        payload = data;
        if (!requestHeaders['content-type'] && typeof data === 'object') {
          requestHeaders['content-type'] = 'application/json';
        }
        return caller;
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      }
    };

    function execute() {
      return new Promise((resolve) => {
        let bodyBuffer = null;
        if (payload !== null && payload !== undefined) {
          if (typeof payload === 'string') {
            bodyBuffer = Buffer.from(payload, 'utf8');
          } else {
            bodyBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
          }
        }

        const req = new Readable({
          read() {
            if (bodyBuffer) {
              this.push(bodyBuffer);
            }
            this.push(null);
          }
        });

        req.method = method;
        req.url = url;
        req.headers = { ...requestHeaders };

        if (bodyBuffer && !req.headers['content-length']) {
          req.headers['content-length'] = bodyBuffer.length.toString();
        }

        const resBuffers = [];
        // Create lightweight mock socket for ServerResponse
        const mockSocket = {
          _writableState: {},
          cork() {},
          uncork() {},
          write() {},
          destroy() {},
          on() {},
          once() {},
          emit() {},
          removeListener() {}
        };

        const res = new http.ServerResponse(req);
        res.assignSocket(mockSocket);

        const origWrite = res.write.bind(res);
        res.write = function (chunk, encoding, cb) {
          if (chunk) {
            resBuffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
          }
          if (typeof encoding === 'function') encoding();
          if (typeof cb === 'function') cb();
          return true;
        };

        res.end = function (chunk, encoding, cb) {
          if (chunk) {
            resBuffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
          }
          if (typeof encoding === 'function') encoding();
          if (typeof cb === 'function') cb();

          const rawBody = Buffer.concat(resBuffers).toString('utf8');
          let parsed = rawBody;
          try {
            parsed = JSON.parse(rawBody);
          } catch (_) {
            // Keep as string if not JSON
          }

          resolve({
            status: res.statusCode,
            headers: res.getHeaders ? res.getHeaders() : {},
            body: parsed,
            text: rawBody
          });
        };

        app(req, res);
      });
    }

    return caller;
  }

  return {
    get: (url) => makeRequest('GET', url),
    post: (url) => makeRequest('POST', url),
    put: (url) => makeRequest('PUT', url),
    delete: (url) => makeRequest('DELETE', url)
  };
}

module.exports = {
  createTestClient
};
