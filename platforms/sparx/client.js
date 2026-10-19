// language: JavaScript (ESM), file: platforms/sparx/client.js
import { log } from '../../utils/logger.js';

export class SparxClient {
  constructor(session) {
    this.session = session;
    this.baseUrl = 'https://api.sparx-learning.com';
  }

  async request(path, payloadBuffer) {
    if (!payloadBuffer || !Buffer.isBuffer(payloadBuffer)) {
      throw new Error('Sparx request payload is missing or not a Buffer');
    }

    const length = payloadBuffer.length;
    const frame = Buffer.alloc(5 + length);
    frame.writeUInt8(0, 0);
    frame.writeUInt32BE(length, 1);
    payloadBuffer.copy(frame, 5);

    const authHeader = this.session.jwt.startsWith('bearer ')
      ? this.session.jwt
      : 'bearer ' + this.session.jwt;

    log('[sparx] POST ' + path);

    const result = await this.session.page.evaluate(async (args) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch(args.url, {
          method: 'POST',
          headers: {
            'accept': '*/*',
            'authorization': args.authHeader,
            'x-session-id': args.sessionId,
            'content-type': 'application/grpc-web+proto',
            'x-grpc-web': '1',
            'origin': 'https://maths.sparx-learning.com',
            'referer': 'https://maths.sparx-learning.com/'
          },
          body: new Uint8Array(args.frame),
          signal: controller.signal
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          return { error: res.status, text: text };
        }

        const arrayBuffer = await res.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return {
          ok: true,
          data: btoa(binary),
          size: bytes.byteLength
        };
      } catch (e) {
        return {
          error: 0,
          text: String(e && e.message ? e.message : e)
        };
      } finally {
        clearTimeout(timeout);
      }
    }, {
      url: this.baseUrl + path,
      authHeader: authHeader,
      sessionId: this.session.sessionId,
      frame: Array.from(frame)
    });

    if (!result) {
      log('[sparx] evaluate returned null/undefined on ' + path);
      throw new Error('Sparx evaluate returned empty result');
    }

    if (result.error) {
      log(
        '[sparx] API error ' +
          result.error +
          ' on ' +
          path +
          ' — ' +
          (result.text || '')
      );
      throw new Error('Sparx API error: ' + result.error);
    }

    if (!result.data || typeof result.data !== 'string') {
      log(
        '[sparx] missing base64 data on ' +
          path +
          ' size=' +
          (result.size || 0)
      );
      throw new Error('Sparx response had no data');
    }

    return Buffer.from(result.data, 'base64');
  }

  async getHomeworkList() {
    const b64 = 'AAAAAA4SDAi19O/SBhDArO/RAw==';
    const payload = Buffer.from(b64, 'base64');
    return this.request(
      '/maths/sparx.packageactivity.v1.Packages/ListStudentPackages',
      payload.subarray(5)
    );
  }

  async getActivity(packageId, taskId, itemNumber) {
    const pathStr =
      'packages/' + packageId + '/tasks/' + taskId + '/items/' + itemNumber;
    const buffer = Buffer.concat([
      Buffer.from([0x12, pathStr.length]),
      Buffer.from(pathStr)
    ]);
    return this.request(
      '/maths/sparx.packageactivity.v1.Activities/GetActivity',
      buffer
    );
  }

  async submitAnswer(activityId, choiceRef, answerText) {
    const activityStr = '/activities/' + activityId;
    const typeStr = choiceRef;
    const ansStr = answerText;

    const buffer = Buffer.concat([
      Buffer.from([0x0a]),
      Buffer.from([activityStr.length + 1]),
      Buffer.from(activityStr),
      Buffer.from([0x12, ansStr.length + typeStr.length + 5]),
      Buffer.from([0x0a]),
      Buffer.from([typeStr.length + 1]),
      Buffer.from([0x0a, typeStr.length]),
      Buffer.from(typeStr),
      Buffer.from([0x12, ansStr.length + 1]),
      Buffer.from([0x0a, ansStr.length]),
      Buffer.from(ansStr)
    ]);

    return this.request(
      '/maths/sparx.packageactivity.v1.Activities/ActivityAction',
      buffer
    );
  }

  async continueActivity(activityId) {
    const activityStr = '/activities/' + activityId;
    const buffer = Buffer.concat([
      Buffer.from([0x0a]),
      Buffer.from([activityStr.length + 1]),
      Buffer.from(activityStr),
      Buffer.from([0x1a, 0x00])
    ]);
    return this.request(
      '/maths/sparx.packageactivity.v1.Activities/ActivityAction',
      buffer
    );
  }

  async getBookworkCheck(packageId, taskId) {
    const pathStr = 'packages/' + packageId + '/tasks/' + taskId;
    const buffer = Buffer.concat([
      Buffer.from([0x0a, pathStr.length]),
      Buffer.from(pathStr)
    ]);
    return this.request(
      '/maths/sparx.packageactivity.v1.Activities/GetBookworkCheck',
      buffer
    );
  }

  async submitBookworkCheck(packageId, taskId, answer) {
    const pathStr = 'packages/' + packageId + '/tasks/' + taskId;
    const buffer = Buffer.concat([
      Buffer.from([0x0a, pathStr.length]),
      Buffer.from(pathStr),
      Buffer.from([0x10, 0x02])
    ]);
    return this.request(
      '/maths/sparx.packageactivity.v1.Activities/AnswerBookworkCheck',
      buffer
    );
  }

  async submitTimesTables(packageId, taskId, answers) {
    const taskPath = 'packages/' + packageId + '/tasks/' + taskId;
    const buffers = [];

    buffers.push(Buffer.from([0x0a, taskPath.length]));
    buffers.push(Buffer.from(taskPath));

    for (const ans of answers) {
      const ansStr = String(ans);
      buffers.push(Buffer.from([0x12, ansStr.length]));
      buffers.push(Buffer.from(ansStr));
    }

    buffers.push(Buffer.from([0x1a, 0x06]));
    buffers.push(Buffer.from('tables'));

    buffers.push(Buffer.from([0x22, 0x0b]));
    buffers.push(Buffer.from('basicKeypad'));

    const payload = Buffer.concat(buffers);
    return this.request(
      '/maths/sparx.timestables.v1.TimesTables/SubmitTimesTablesAnswers',
      payload
    );
  }
}
