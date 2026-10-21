// language: JavaScript (ESM), file: platforms/sparx/client.js
import { log } from '../../utils/logger.js';

export class SparxClient {
  constructor(session) {
    this.session = session;
    this.baseUrl = 'https://api.sparx-learning.com';
  }

  async request(path, payloadBuffer) {
    if (!payloadBuffer || !Buffer.isBuffer(payloadBuffer)) throw new Error('Sparx request payload is missing');
    const length = payloadBuffer.length;
    const frame = Buffer.alloc(5 + length);
    frame.writeUInt8(0, 0); frame.writeUInt32BE(length, 1); payloadBuffer.copy(frame, 5);
    const authHeader = this.session.jwt.startsWith('bearer ') ? this.session.jwt : 'bearer ' + this.session.jwt;
    const result = await this.session.page.evaluate(async (args) => {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch(args.url, {
          method: 'POST',
          headers: { accept: '*/*', authorization: args.authHeader, 'x-session-id': args.sessionId, 'content-type': 'application/grpc-web+proto', 'x-grpc-web': '1', origin: 'https://maths.sparx-learning.com', referer: 'https://maths.sparx-learning.com/' },
          body: new Uint8Array(args.frame), signal: controller.signal
        });
        const arrayBuffer = await res.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        if (!res.ok) return { error: res.status, text: new TextDecoder().decode(bytes).slice(0, 200) };
        return { ok: true, data: binary.length ? btoa(binary) : '', status: res.status, grpcStatus: res.headers.get('grpc-status'), grpcMessage: res.headers.get('grpc-message') };
      } catch (e) { return { error: 0, text: String(e.message) }; } finally { clearTimeout(timeout); }
    }, { url: this.baseUrl + path, authHeader, sessionId: this.session.sessionId, frame: Array.from(frame) });

    if (result.error) throw new Error('Sparx API error: ' + result.error);
    if (!result.data) {
      log('[sparx] empty response on ' + path + ' status=' + result.status + ' grpcStatus=' + result.grpcStatus + ' grpcMessage=' + result.grpcMessage);
      throw new Error('Sparx response had no data');
    }
    return Buffer.from(result.data, 'base64');
  }

  async getHomeworkList() {
    const payload = Buffer.from('AAAAAA4SDAi19O/SBhDArO/RAw==', 'base64');
    return this.request('/maths/sparx.packageactivity.v1.Packages/ListStudentPackages', payload.subarray(5));
  }

  async getPackage(packageId) {
    const path = 'packages/' + packageId;
    return this.request('/maths/sparx.packageactivity.v1.Packages/GetPackage', Buffer.concat([Buffer.from([0x0a, path.length]), Buffer.from(path)]));
  }

  async getActivity(packageId, taskId, itemNumber) {
    const pathStr = 'packages/' + packageId + '/tasks/' + taskId + '/items/' + itemNumber;
    return this.request('/maths/sparx.packageactivity.v1.Activities/GetActivity', Buffer.concat([Buffer.from([0x12, pathStr.length]), Buffer.from(pathStr)]));
  }

  async submitAnswer(activityId, choiceRef, answerText) {
    const activityStr = '/activities/' + activityId;
    const inner = Buffer.concat([ Buffer.from([0x0a, choiceRef.length]), Buffer.from(choiceRef), Buffer.from([0x12, answerText.length]), Buffer.from(answerText) ]);
    return this.request('/maths/sparx.packageactivity.v1.Activities/ActivityAction', Buffer.concat([ Buffer.from([0x0a, activityStr.length]), Buffer.from(activityStr), Buffer.from([0x12, inner.length]), inner ]));
  }

  async submitTextSlot(activityId, slotRef, answerText) {
    const activityStr = '/activities/' + activityId;
    const inner = Buffer.concat([ Buffer.from([0x0a, slotRef.length]), Buffer.from(slotRef), Buffer.from([0x12, answerText.length]), Buffer.from(answerText) ]);
    return this.request('/maths/sparx.packageactivity.v1.Activities/ActivityAction', Buffer.concat([ Buffer.from([0x0a, activityStr.length]), Buffer.from(activityStr), Buffer.from([0x12, inner.length]), inner ]));
  }

  async submitMultiText(activityId, textFields, answers) {
    const activityStr = '/activities/' + activityId;
    const innerParts = [];
    for (let i = 0; i < textFields.length; i++) {
      const ref = textFields[i].ref;
      const text = answers[i] || '';
      const fieldMsg = Buffer.concat([ Buffer.from([0x0a, ref.length]), Buffer.from(ref), Buffer.from([0x12, text.length]), Buffer.from(text) ]);
      innerParts.push(Buffer.from([0x12, fieldMsg.length]), fieldMsg);
    }
    const inner = Buffer.concat(innerParts);
    return this.request('/maths/sparx.packageactivity.v1.Activities/ActivityAction', Buffer.concat([ Buffer.from([0x0a, activityStr.length]), Buffer.from(activityStr), Buffer.from([0x12, inner.length]), inner ]));
  }

  async submitFlashcard(activityId, slotRef, cardRef) {
    const activityStr = '/activities/' + activityId;
    const slotMsg = Buffer.concat([ Buffer.from([0x0a, slotRef.length]), Buffer.from(slotRef) ]);
    const inner = Buffer.concat([ Buffer.from([0x0a, slotMsg.length]), slotMsg, Buffer.from([0x12, cardRef.length]), Buffer.from(cardRef) ]);
    return this.request('/maths/sparx.packageactivity.v1.Activities/ActivityAction', Buffer.concat([ Buffer.from([0x0a, activityStr.length]), Buffer.from(activityStr), Buffer.from([0x12, inner.length]), inner ]));
  }

  async continueActivity(activityId) {
    const activityStr = '/activities/' + activityId;
    return this.request('/maths/sparx.packageactivity.v1.Activities/ActivityAction', Buffer.concat([ Buffer.from([0x0a, activityStr.length]), Buffer.from(activityStr), Buffer.from([0x1a, 0x00]) ]));
  }

  async getBookworkCheck(packageId, taskId) {
    const pathStr = 'packages/' + packageId + '/tasks/' + taskId;
    return this.request('/maths/sparx.packageactivity.v1.Activities/GetBookworkCheck', Buffer.concat([ Buffer.from([0x0a, pathStr.length]), Buffer.from(pathStr) ]));
  }

  async submitBookworkCheck(packageId, taskId, answer) {
    const pathStr = 'packages/' + packageId + '/tasks/' + taskId;
    return this.request('/maths/sparx.packageactivity.v1.Activities/AnswerBookworkCheck', Buffer.concat([ Buffer.from([0x0a, pathStr.length]), Buffer.from(pathStr), Buffer.from([0x10, 0x02]) ]));
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
    return this.request('/maths/sparx.timestables.v1.TimesTables/SubmitTimesTablesAnswers', Buffer.concat([ Buffer.from([0x0a, questionMsg.length]), questionMsg, Buffer.from([0x12, taskPath.length]), Buffer.from(taskPath) ]));
  }
}
