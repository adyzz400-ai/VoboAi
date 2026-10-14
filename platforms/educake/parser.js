// language: JavaScript (ESM), file: platforms/educake/parser.js
// *Normalize an Educake question object into the shape the answer loop + Gemini expect.*
// type enum (locked): "multiple" | "text" | "number"
export function normalizeQuestion(q) {
  if (!q) return null;
  const kind = q.type === 'multiple' ? 'multiple_choice'
            : q.type === 'number'   ? 'number'
            :                         'short_answer';
  return {
    variantId: q.id,
    testQuestionId: q.testQuestionId,
    kind,
    prompt: q.question,
    choices: kind === 'multiple_choice' ? (q.choices ?? []) : null,
    unit: q.extra || null,
    image: q.image || null,
    imageAlt: q.imageAlt || null,
    renderer: q.questionRenderer,
    raw: q,
  };
}

export function normalizeAttempt(attempt) {
  const order = (attempt.questions ?? []).map(String);
  const map = attempt.questionMap ?? {};
  return {
    attemptId: attempt.id,
    title: attempt.name,
    questionCount: attempt.questionCount,
    questions: order.map(vid => normalizeQuestion(map[vid])).filter(Boolean),
    topicSummary: attempt.topicSummary ?? [],
    raw: attempt,
  };
}

// Validate a raw user-facing answer against the parser's shape.
export function coerceGivenAnswer(q, value) {
  if (value == null) return null;
  let s = String(value).trim();
  if (q.kind === 'multiple_choice') {
    // exact match, then case-insensitive match against choices
    if (q.choices.includes(s)) return s;
    const ci = q.choices.find(c => c.toLowerCase() === s.toLowerCase());
    if (ci) return ci;
    return null;
  }
  if (q.kind === 'number') {
    // strip trailing unit the model sometimes appends
    if (q.unit) {
      const esc = q.unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(new RegExp(`\\s*${esc}\\s*$`, 'i'), '').trim();
    }
    // keep digits, dot, minus — drop commas/units that leak through
    s = s.replace(/,/g, '').replace(/[^\d.\-eE]/g, '').trim();
    if (!s || Number.isNaN(Number(s))) return null;
    return s;
  }
  return s;
}
