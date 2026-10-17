// language: JavaScript (ESM), file: platforms/educake/progress.js
import { renderProgressBar } from '../../utils/progressBar.js';

export function renderEducakeProgress(filled, total) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return renderProgressBar({ 
    filled: filled, 
    total: total, 
    accent: '#00A8E1', 
    track: '#1E3A4C', 
    label: pct + '%' 
  });
}

export function renderScoreBar(filled, total) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return renderProgressBar({ 
    filled: filled, 
    total: total, 
    accent: '#22C55E', 
    track: '#1F2937', 
    label: pct + '%' 
  });
}