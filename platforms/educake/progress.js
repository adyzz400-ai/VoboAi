// language: JavaScript (ESM), file: platforms/educake/progress.js
// *Educake-palette wrappers around the shared PNG renderer.*
import { renderProgressBar } from '../../utils/progressBar.js';

const EDU_ACCENT = '#00A8E1';
const EDU_TRACK  = '#1E3A4C';
const SCORE_ACCENT = '#22C55E';
const SCORE_TRACK  = '#1F2937';

export function renderEducakeProgress(filled, total) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return renderProgressBar({ filled, total, accent: EDU_ACCENT, track: EDU_TRACK, label: `${pct}%` });
}

export function renderScoreBar(filled, total) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return renderProgressBar({ filled, total, accent: SCORE_ACCENT, track: SCORE_TRACK, label: `${pct}%` });
}
