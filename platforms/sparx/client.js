// language: JavaScript (ESM), file: platforms/sparx/client.js
import { log } from '../../utils/logger.js';

export class SparxClient {
  constructor(session) {
    this.session = session;
    this.baseUrl = 'https://api.sparx-learning.com';
  }

  async request(path, payloadBuffer) {
    const length = payloadBuffer.length;
    const frame = Buffer.alloc(5 + length);
    frame.writeUInt8(0, 0);
    frame.writeUInt32BE(length, 1);
    payloadBuffer.copy(frame, 5);

    const headers = {
      'accept': '*/*',
      'content-type': 'application/grpc-web+proto',
      'x-grpc-web': '1',
      'origin': 'https://maths.sparx-learning.com',
      'referer': 'https://maths.sparx-learning.com/',
      'cookie': this.session.cookie
    };

    // Only send auth header if we have a real JWT
    if (this.session.jwt !== 'cookie-only-session') {
      headers['authorization'] = 'bearer ' + this.session.jwt;
      headers['x-session-id'] = this.session.sessionId;
    }

    const res = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers: headers,
      body: frame
    });

    if (!res.ok) {
      log('[sparx] API error ' + res.status + ' on ' + path);
      throw new Error('Sparx API error: ' + res.status);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async getHomeworkList() {
    const b64 = 'AAAAAA4SDAi19O/SBhDArO/RAw==';
    const payload = Buffer.from(b64, 'base64');
    return this.request('/maths/sparx.packageactivity.v1.Packages/ListStudentPackages', payload.subarray(5));
  }

  // ... (rest of methods: getActivity, submitAnswer, continueActivity, getBookworkCheck, submitBookworkCheck, submitTimesTables)
}
