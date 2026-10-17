// language: JavaScript (ESM), file: utils/progressBar.js
import { createCanvas } from '@napi-rs/canvas';

export function renderProgressBar(filled, total) {
  const width = 450;
  const height = 24;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Dark track
  ctx.fillStyle = '#1E1F22';
  ctx.fillRect(0, 0, width, height);

  // Blue fill
  const ratio = total > 0 ? Math.max(0, Math.min(1, filled / total)) : 0;
  ctx.fillStyle = '#5865F2';
  ctx.fillRect(0, 0, width * ratio, height);

  // Sharp blue outline
  ctx.strokeStyle = '#5865F2';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width - 4, height - 4);

  return canvas.toBuffer('image/png');
}
