// language: JavaScript (ESM), file: platforms/educake/quizzes.js
// *The four real calls: list, start, answer, finish. All shapes taken from captured traffic.*
import { EducakeClient } from './client.js';

// Dashboard list — GET /api/student/quiz
// Query params reflect the dashboard's filters. limit bumped to pull everything.
export async function listQuizzes(session, { type = 'teacher', limit = 50, completed = 0, excludeRetakes = 1, includeArchived = 0 } = {}) {
  const client = new EducakeClient(session.page, session);
  const qs = new URLSearchParams({
    type, subject: '0', completed: String(completed),
    excludeRetakes: String(excludeRetakes),
    limit: String(limit),
    includeArchived: String(includeArchived),
  }).toString();
  const raw = await client.get(`/api/student/quiz?${qs}`);
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
    dueDate: a.dueDate,               // "YYYY-MM-DD" or null
    startDate: a.startDate,
    questionCount: a.questionCount,
    answerCount: a.answerCount,
    correctCount: a.correctCount,
    status: a.status,                 // "new" | "in_progress" | "completed"
    overdue: a.overdue,
    isRetake: a.isRetake,
    isArchived: a.isArchived,
    setterName: a.setterName,
    testType: a.testType,
  };
}

// Start an attempt — POST /api/student/quiz with the same "create" body.
// For an assigned (teacher) quiz, use the assessmentId from the dashboard.
export async function startQuiz(session, assessmentId) {
  const client = new EducakeClient(session.page, session);
  const raw = await client.post('/api/student/quiz', {
    courseId: 1,
    courses: [1],
    assessmentId,
    modules: null,
    units: null,
    topics: null,
    numberOfQuestions: null,
    includeHigherTier: false,
    excludeCorrect: true,
  });
  const attempts = raw?.attempt ?? {};
  const attemptIdStr = Object.keys(attempts)[0];
  if (!attemptIdStr) throw new Error('startQuiz: no attempt returned');
  const attempt = attempts[attemptIdStr];
  return { attemptId: Number(attemptIdStr), attempt };
}

// Answer — POST /api/attempt/{attemptId}/quiztion/{testQuestionId}/variant/{variantId}/answer
export async function submitAnswer(session, { attemptId, testQuestionId, variantId, givenAnswer }) {
  const client = new EducakeClient(session.page, session);
  const url = `/api/attempt/${attemptId}/quiztion/${testQuestionId}/variant/${variantId}/answer`;
  const raw = await client.post(url, { givenAnswer });
  return raw?.answer ?? null;
}

// Finish — best-effort guess from URL pattern; falls back to leaving the attempt complete.
// If Educake exposes a different endpoint, this throws and the run reports what it saw.
export async function finishQuiz(session, attemptId) {
  const client = new EducakeClient(session.page, session);
  try {
    const raw = await client.post(`/api/attempt/${attemptId}/finish`, {});
    return raw ?? { finished: true };
  } catch (err) {
    // fall through — some attempts auto-finish when the last question is answered
    return { finished: false, note: `finish endpoint returned ${err.status ?? '?'}` };
  }
}
