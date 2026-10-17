// language: JavaScript (ESM), file: platforms/educake/quizzes.js
import { EducakeClient } from './client.js';

export async function listQuizzes(session, opts = {}) {
  const client = new EducakeClient(session.page, session);
  const qs = new URLSearchParams({
    type: opts.type || 'teacher',
    subject: '0',
    completed: String(opts.completed || 0),
    excludeRetakes: String(opts.excludeRetakes === undefined ? 1 : opts.excludeRetakes),
    limit: String(opts.limit || 50),
    includeArchived: String(opts.includeArchived || 0),
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
    attemptId: a.id, assessmentId: a.assessmentId, title: a.name, subject: a.displaySubject,
    course: a.course, dueDate: a.dueDate, startDate: a.startDate, questionCount: a.questionCount,
    answerCount: a.answerCount, correctCount: a.correctCount, status: a.status,
    overdue: a.overdue, isRetake: a.isRetake, isArchived: a.isArchived, setterName: a.setterName, testType: a.testType,
  };
}

export async function openAttempt(session, attemptId) {
  const client = new EducakeClient(session.page, session);
  const raw = await client.get('/api/student/quiz/' + attemptId);
  const attempts = raw?.attempt ?? {};
  const attemptIdStr = Object.keys(attempts)[0];
  if (!attemptIdStr) throw new Error('openAttempt: no attempt returned for id ' + attemptId);
  return { attemptId: Number(attemptIdStr), attempt: attempts[attemptIdStr] };
}

export async function submitAnswer(session, args) {
  const client = new EducakeClient(session.page, session);
  const url = '/api/attempt/' + args.attemptId + '/quiztion/' + args.testQuestionId + '/variant/' + args.variantId + '/answer';
  const raw = await client.post(url, { givenAnswer: args.givenAnswer });
  return raw?.answer ?? null;
}

export async function finishQuiz(session, attemptId) {
  const client = new EducakeClient(session.page, session);
  try {
    // Educake's actual finish endpoint
    const raw = await client.post('/api/attempt/' + attemptId + '/finish', {});
    return raw ?? { finished: true };
  } catch (err) {
    // fallback if the endpoint changes
    return { finished: false, note: 'finish endpoint returned ' + (err.status ?? '?') };
  }
}
