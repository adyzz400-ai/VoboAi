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

    log(
      '[sparx] POST ' +
        path +
        ' frameHex=' +
        frame.toString('hex').slice(0, 80)
    );

    const result = await this.session.page.evaluate(async (args) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch(args.url, {
          method: 'POST',
          headers: {
            accept: '*/*',
            authorization: args.authHeader,
            'x-session-id': args.sessionId,
            'content-type': 'application/grpc-web+proto',
            'x-grpc-web': '1',
            origin: 'https://maths.sparx-learning.com',
            referer: 'https://maths.sparx-learning.com/'
          },
          body: new Uint8Array(args.frame),
          signal: controller.signal
        });

        const arrayBuffer = await res.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const headerEntries = [];
        try {
          res.headers.forEach((v, k) => headerEntries.push(k + ': ' + v));
        } catch (_) {}

        if (!res.ok) {
          return {
            error: res.status,
            text: new TextDecoder().decode(bytes).slice(0, 200),
            status: res.status,
            headers: headerEntries,
            size: bytes.byteLength
          };
        }

        return {
          ok: true,
          data: binary.length ? btoa(binary) : '',
          size: bytes.byteLength,
          status: res.status,
          headers: headerEntries,
          grpcStatus: res.headers.get('grpc-status'),
          grpcMessage: res.headers.get('grpc-message')
        };
      } catch (e) {
        return {
          error: 0,
          text: String(e && e.message ? e.message : e),
          status: -1,
          headers: []
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
      log(
        '[sparx]   status=' +
          result.status +
          ' size=' +
          result.size +
          ' headers=' +
          JSON.stringify(result.headers || [])
      );
      throw new Error('Sparx API error: ' + result.error);
    }

    if (
      !result.data ||
      typeof result.data !== 'string' ||
      result.data.length === 0
    ) {
      log(
        '[sparx] empty response on ' +
          path +
          ' status=' +
          result.status +
          ' size=' +
          result.size +
          ' grpcStatus=' +
          (result.grpcStatus || 'none') +
          ' grpcMessage=' +
          (result.grpcMessage || 'none')
      );
      log(
        '[sparx]   headers=' + JSON.stringify(result.headers || [])
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

  async getPackage(packageId) {
    // List responses use "-packages/uuid"; GetPackage wants "packages/uuid"
    const path = 'packages/' + packageId;
    const payload = Buffer.concat([
      Buffer.from([0x0a, path.length]),
      Buffer.from(path)
    ]);
    return this.request(
      '/maths/sparx.packageactivity.v1.Packages/GetPackage',
      payload
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
    const inner = Buffer.concat([
      Buffer.from([0x0a, choiceRef.length]),
      Buffer.from(choiceRef),
      Buffer.from([0x12, answerText.length]),
      Buffer.from(answerText)
    ]);
    const buffer = Buffer.concat([
      Buffer.from([0x0a, activityStr.length]),
      Buffer.from(activityStr),
      Buffer.from([0x12, inner.length]),
      inner
    ]);
    return this.request(
      '/maths/sparx.packageactivity.v1.Activities/ActivityAction',
      buffer
    );
  }

  async submitTextAnswer(activityId, fieldRef, answerText) {
    const activityStr = '/activities/' + activityId;
    const refMsg = Buffer.concat([
      Buffer.from([0x0a, fieldRef.length]),
      Buffer.from(fieldRef)
    ]);
    const inner = Buffer.concat([
      Buffer.from([0x0a, refMsg.length]),
      refMsg,
      Buffer.from([0x12, answerText.length]),
      Buffer.from(answerText)
    ]);
    const buffer = Buffer.concat([
      Buffer.from([0x0a, activityStr.length]),
      Buffer.from(activityStr),
      Buffer.from([0x12, inner.length]),
      inner
    ]);
    return this.request(
      '/maths/sparx.packageactivity.v1.Activities/ActivityAction',
      buffer
    );
  }

  async submitFlashcard(activityId, slotRef, cardRef) {
    const activityStr = '/activities/' + activityId;
    const slotMsg = Buffer.concat([
      Buffer.from([0x0a, slotRef.length]),
      Buffer.from(slotRef)
    ]);
    const inner = Buffer.concat([
      Buffer.from([0x0a, slotMsg.length]),
      slotMsg,
      Buffer.from([0x12, cardRef.length]),
      Buffer.from(cardRef)
    ]);
    const buffer = Buffer.concat([
      Buffer.from([0x0a, activityStr.length]),
      Buffer.from(activityStr),
      Buffer.from([0x12, inner.length]),
      inner
    ]);
    return this.request(
      '/maths/sparx.packageactivity.v1.Activities/ActivityAction',
      buffer
    );
  }

  async continueActivity(activityId) {
    const activityStr = '/activities/' + activityId;
    const buffer = Buffer.concat([
      Buffer.from([0x0a, activityStr.length]),
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

  async submitTimesTablesOne(packageId, taskId, promptStr, answerStr) {
    const taskPath = 'packages/' + packageId + '/tasks/' + taskId;
    const parts = [];
    parts.push(Buffer.from([0x12, promptStr.length]), Buffer.from(promptStr));
    parts.push(Buffer.from([0x1a, answerStr.length]), Buffer.from(answerStr));
    parts.push(Buffer.from([0x20, 0x01]));
    parts.push(Buffer.from([0x52, answerStr.length]), Buffer.from(answerStr));
    parts.push(Buffer.from([0x6a, 6]), Buffer.from('tables'));
    parts.push(Buffer.from([0x72, 11]), Buffer.from('basicKeypad'));
    parts.push(Buffer.from([0x90, 0x01, 0x01]));
    const questionMsg = Buffer.concat(parts);
    const buffer = Buffer.concat([
      Buffer.from([0x0a, questionMsg.length]),
      questionMsg,
      Buffer.from([0x12, taskPath.length]),
      Buffer.from(taskPath)
    ]);
    return this.request(
      '/maths/sparx.timestables.v1.TimesTables/SubmitTimesTablesAnswers',
      buffer
    );
  }
}
