// language: JavaScript (ESM), file: platforms/educake/quizzes.js
import { EducakeClient } from './client.js';

export async function listQuizzes(session, opts = {}) {
  const type = opts.type || 'teacher';
  const limit = opts.limit || 50;
  const completed = opts.completed || 0;
  const excludeRetakes = opts.excludeRetakes === undefined ? 1 : opts.excludeRetakes;
  const includeArchived = opts.includeArchived || 0;

  const client = new EducakeClient(session.page, session);
  const qs = new URLSearchParams({
    type: type,
    subject: '0',
    completed: String(completed),
    excludeRetakes: String(excludeRetakes),
    limit: String(limit),
    includeArchived: String(includeArchived),
  }).toString();
  const raw = await client.get('/api/student/quiz?' + qs);
  const attempts = raw?.attempts ?? {};
  return {
    total: raw?.total ?? Object.keys(attempts).length,
    quizzes: Object.values(attempts).map(normalizeQuiz),
  };
}

function normalizeQuiz(a) {
  return {
    attemptId: a.id,
    assessmentId: a.assessmentId,
    title: a.name,
    subject: a.displaySubject,
    course: a.course,
    dueDate: a.dueDate,
    startDate: a.startDate,
    questionCount: a.questionCount,
    answerCount: a.answerCount,
    correctCount: a.correctCount,
    status: a.status,
    overdue: a.overdue,
    isRetake: a.isRetake,
    isArchived: a.isArchived,
    setterName: a.setterName,
    testType: a.testType,
  };
}

// Assigned-quiz opener — GET /api/student/quiz/{attemptId}
// Returns the existing attempt with its full question set. No quiz creation.
export async function openAttempt(session, attemptId) {
  const client = new EducakeClient(session.page, session);
  const raw = await client.get('/api/student/quiz/' + attemptId);
  const attempts = raw?.attempt ?? {};
  const attemptIdStr = Object.keys(attempts)[0];
  if (!attemptIdStr) throw new Error('openAttempt: no attempt returned for id ' + attemptId);
  const attempt = attempts[attemptIdStr];
  return { attemptId: Number(attemptIdStr), attempt: attempt };
}

// Answer — POST /api/attempt/{attemptId}/quiztion/{testQuestionId}/variant/{variantId}/answer
export async function submitAnswer(session, args) {
  const client = new EducakeClient(session.page, session);
  const url = '/api/attempt/' + args.attemptId +
    '/quiztion/' + args.testQuestionId +
    '/variant/' + args.variantId +
    '/answer';
  const raw = await client.post(url, { givenAnswer: args.givenAnswer });
  return raw?.answer ?? null;
}

// Finish — best-effort; Educake may auto-finish when the last question is answered.
export async function finishQuiz(session, attemptId) {
  const client = new EducakeClient(session.page, session);
  try {
    const raw = await client.post('/api/attempt/' + attemptId + '/finish', {});
    return raw ?? { finished: true };
  } catch (err) {
    return { finished: false, note: 'finish endpoint returned ' + (err.status ?? '?') };
  }
}