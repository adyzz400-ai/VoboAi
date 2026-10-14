// language: JavaScript (ESM), file: utils/progressBar.js
// *PNG progress bar via @napi-rs/canvas. Every tick rebuilds the buffer and swaps the attachment.*
import { createCanvas } from '@napi-rs/canvas';

const roundRect = (ctx, x, y, w, h, r) => {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
};

export function renderProgressBar({
  filled, total,
  width = 440, height = 24, radius = 12,
  accent = '#22C55E', track = '#1F2937', bg = 'transparent',
  label = null, labelFont = '500 14px sans-serif',
} = {}) {
  const labelPad = label ? 56 : 0;
  const canvas = createCanvas(width + labelPad, height);
  const ctx = canvas.getContext('2d');

  if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }

  ctx.fillStyle = track;
  roundRect(ctx, 0, 0, width, height, radius);
  ctx.fill();

  const ratio = total > 0 ? Math.max(0, Math.min(1, filled / total)) : 0;
  if (ratio > 0) {
    ctx.save();
    roundRect(ctx, 0, 0, width, height, radius);
    ctx.clip();
    ctx.fillStyle = accent;
    roundRect(ctx, 0, 0, width * ratio, height, radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, width - 1, height - 1, radius);
  ctx.stroke();

  if (label) {
    ctx.fillStyle = '#E5E7EB';
    ctx.font = labelFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, width + 12, height / 2 + 1);
  }

  return canvas.toBuffer('image/png');
}

export function renderMultiBar({
  bars, width = 440, height = 22, gap = 10, radius = 11,
  accent = '#22C55E', track = '#1F2937', bg = 'transparent',
  labelFont = '500 14px sans-serif', labelWidth = 90,
}) {
  const totalH = bars.length * height + (bars.length - 1) * gap;
  const canvas = createCanvas(width + labelWidth + 70, totalH);
  const ctx = canvas.getContext('2d');
  if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }

  bars.forEach((b, i) => {
    const y = i * (height + gap);
    ctx.fillStyle = '#E5E7EB';
    ctx.font = labelFont;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label ?? `Task ${i + 1}`, 0, y + height / 2 + 1);

    const barX = labelWidth;
    ctx.fillStyle = track;
    roundRect(ctx, barX, y, width, height, radius);
    ctx.fill();

    const ratio = b.total > 0 ? Math.max(0, Math.min(1, b.filled / b.total)) : 0;
    if (ratio > 0) {
      ctx.save();
      roundRect(ctx, barX, y, width, height, radius);
      ctx.clip();
      ctx.fillStyle = accent;
      roundRect(ctx, barX, y, width * ratio, height, radius);
      ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    roundRect(ctx, barX + 0.5, y + 0.5, width - 1, height - 1, radius);
    ctx.stroke();

    ctx.fillStyle = '#E5E7EB';
    ctx.font = labelFont;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(ratio * 100)}%`, barX + width + 60, y + height / 2 + 1);
  });

  return canvas.toBuffer('image/png');
}
