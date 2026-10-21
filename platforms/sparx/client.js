// language: JavaScript (ESM), file: platforms/sparx/client.js (methods)

async getPackage(packageId) {
  const path = '-packages/' + packageId;
  const buffer = Buffer.concat([Buffer.from([0x0a, path.length]), Buffer.from(path)]);
  return this.request('/maths/sparx.packageactivity.v1.Packages/GetPackage', buffer);
}

// MC answer: ref + answer text, inner wrapped in field 2
async submitAnswer(activityId, choiceRef, answerText) {
  const activityStr = '/activities/' + activityId;
  const inner = Buffer.concat([
    Buffer.from([0x0a, choiceRef.length]), Buffer.from(choiceRef),
    Buffer.from([0x12, answerText.length]), Buffer.from(answerText),
  ]);
  const buffer = Buffer.concat([
    Buffer.from([0x0a, activityStr.length]), Buffer.from(activityStr),
    Buffer.from([0x12, inner.length]), inner,
  ]);
  return this.request('/maths/sparx.packageactivity.v1.Activities/ActivityAction', buffer);
}

// Text-field answer: ref wrapped in submessage, then text
async submitTextAnswer(activityId, fieldRef, answerText) {
  const activityStr = '/activities/' + activityId;
  const refMsg = Buffer.concat([Buffer.from([0x0a, fieldRef.length]), Buffer.from(fieldRef)]);
  const inner = Buffer.concat([
    Buffer.from([0x0a, refMsg.length]), refMsg,
    Buffer.from([0x12, answerText.length]), Buffer.from(answerText),
  ]);
  const buffer = Buffer.concat([
    Buffer.from([0x0a, activityStr.length]), Buffer.from(activityStr),
    Buffer.from([0x12, inner.length]), inner,
  ]);
  return this.request('/maths/sparx.packageactivity.v1.Activities/ActivityAction', buffer);
}

// Card-slot flashcard: slot ref wrapped in submessage, card ref as second field
async submitFlashcard(activityId, slotRef, cardRef) {
  const activityStr = '/activities/' + activityId;
  const slotMsg = Buffer.concat([Buffer.from([0x0a, slotRef.length]), Buffer.from(slotRef)]);
  const inner = Buffer.concat([
    Buffer.from([0x0a, slotMsg.length]), slotMsg,
    Buffer.from([0x12, cardRef.length]), Buffer.from(cardRef),
  ]);
  const buffer = Buffer.concat([
    Buffer.from([0x0a, activityStr.length]), Buffer.from(activityStr),
    Buffer.from([0x12, inner.length]), inner,
  ]);
  return this.request('/maths/sparx.packageactivity.v1.Activities/ActivityAction', buffer);
}

// Continue after wrong answer (also used to advance past reveal)
async continueActivity(activityId) {
  const activityStr = '/activities/' + activityId;
  const buffer = Buffer.concat([
    Buffer.from([0x0a, activityStr.length]), Buffer.from(activityStr),
    Buffer.from([0x1a, 0x00]),
  ]);
  return this.request('/maths/sparx.packageactivity.v1.Activities/ActivityAction', buffer);
}

// Times Tables: one question per POST. Server tolerates stateless submits;
// if prompt/round-tag matters in a specific round, capture round-start later.
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
    Buffer.from([0x0a, questionMsg.length]), questionMsg,
    Buffer.from([0x12, taskPath.length]), Buffer.from(taskPath),
  ]);
  return this.request('/maths/sparx.timestables.v1.TimesTables/SubmitTimesTablesAnswers', buffer);
}
