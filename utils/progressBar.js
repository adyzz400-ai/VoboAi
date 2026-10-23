// language: JavaScript (ESM), file: utils/progressBar.js
import { createCanvas } from '@napi-rs/canvas';

const BAR_WIDTH = 420;
const BAR_HEIGHT = 22;
const ROW_HEIGHT = 36;
const PADDING_X = 16;
const PADDING_Y = 12;
const LABEL_WIDTH = 140;
const PERCENT_WIDTH = 50;
const FONT = 'bold 18px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const SMALL_FONT = '14px "Segoe UI", "Helvetica Neue", Arial, sans-serif';

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function renderMultiBar({ bars, accent = '#0A78FF', labelWidth = LABEL_WIDTH }) {
  const accentRgb = hexToRgb(accent);
  const totalHeight = PADDING_Y * 2 + bars.length * ROW_HEIGHT;
  const canvasWidth = labelWidth + BAR_WIDTH + PERCENT_WIDTH + PADDING_X * 2;

  const canvas = createCanvas(canvasWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  // Transparent background (Discord embed handles the card)
  ctx.clearRect(0, 0, canvasWidth, totalHeight);

  bars.forEach((bar, i) => {
    const y = PADDING_Y + i * ROW_HEIGHT;
    const pct = bar.total > 0 ? Math.min(100, Math.round((bar.filled / bar.total) * 100)) : 0;
    const label = (bar.label || 'Task').slice(0, 22);

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, PADDING_X, y + ROW_HEIGHT / 2);

    // Bar track (dark outline)
    const barX = PADDING_X + labelWidth;
    const barY = y + (ROW_HEIGHT - BAR_HEIGHT) / 2;

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, barX, barY, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2);
    ctx.fillStyle = 'rgba(30,30,40,0.8)';
    ctx.fill();
    ctx.stroke();

    // Bar fill
    if (pct > 0) {
      const fillWidth = Math.max(4, (BAR_WIDTH - 4) * (pct / 100));
      const isComplete = pct === 100;
      const fillRgb = isComplete ? { r: 88, g: 166, b: 95 } : accentRgb;

      ctx.fillStyle = `rgb(${fillRgb.r},${fillRgb.g},${fillRgb.b})`;
      drawRoundedRect(ctx, barX + 2, barY + 2, fillWidth - 4, BAR_HEIGHT - 4, (BAR_HEIGHT - 4) / 2);
      ctx.fill();

      // Inner highlight
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      drawRoundedRect(ctx, barX + 2, barY + 2, fillWidth - 4, (BAR_HEIGHT - 4) / 2, (BAR_HEIGHT - 4) / 2);
      ctx.fill();
    }

    // Percentage
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT;
    ctx.textAlign = 'right';
    ctx.fillText(pct + '%', canvasWidth - PADDING_X, y + ROW_HEIGHT / 2);
    ctx.textAlign = 'left';
  });

  return canvas.toBuffer('image/png');
}
