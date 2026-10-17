// language: JavaScript (ESM), file: platforms/educake/progress.js
import { renderProgressBar } from '../../utils/progressBar.js';

export function renderEducakeProgress(filled, total, correct, incorrect) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  
  // Format: "62% (12✓ 1✗)"
  let labelText = pct + '%';
  if (correct !== undefined && incorrect !== undefined) {
    labelText += ' (' + correct + '✓ ' + incorrect + '✗)';
  }

  return renderProgressBar({ 
    filled: filled, 
    total: total, 
    accent: '#00A8E1', 
    track: '#1E3A4C', 
    label: labelText 
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
