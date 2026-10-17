// language: JavaScript (ESM), file: utils/senaiLayout.js
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { renderProgressBar } from './progressBar.js';
import { warn } from './logger.js';

export async function renderSenAIProgressBar(index, totalQuestions, correct) {
  try {
    const width = 500;
    const height = 110;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // 1. Draw the text "1. Task 1"
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(index + '. Task ' + index, 20, 20);
    
    // 2. Draw the percentage box
    const pct = Math.round((correct / totalQuestions) * 100);
    const pctText = pct + '%';
    
    ctx.font = 'bold 18px sans-serif';
    const textWidth = ctx.measureText(pctText).width;
    const boxWidth = textWidth + 24;
    const boxHeight = 32;
    const boxX = 130;
    const boxY = 16; // Adjusted to align with text
    
    // Draw dark rounded background for percentage
    ctx.fillStyle = '#2B2D31';
    ctx.beginPath();
    const r = 6;
    ctx.moveTo(boxX + r, boxY);
    ctx.lineTo(boxX + boxWidth - r, boxY);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + r);
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight - r);
    ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - r, boxY + boxHeight);
    ctx.lineTo(boxX + r, boxY + boxHeight);
    ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - r);
    ctx.lineTo(boxX, boxY + r);
    ctx.quadraticCurveTo(boxX, boxY, boxX + r, boxY);
    ctx.closePath();
    ctx.fill();
    
    // Draw the percentage text
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pctText, boxX + (boxWidth / 2), boxY + (boxHeight / 2) + 2);
    
    // 3. Draw the thick progress bar below it
    const barBuf = renderProgressBar({
      filled: correct,
      total: totalQuestions,
      width: 460,
      height: 32
    });
    
    const img = await loadImage(barBuf);
    ctx.drawImage(img, 20, 65);
    
    return canvas.toBuffer('image/png');
  } catch (err) {
    warn('[senai] render failed: ' + err.message);
    return null;
  }
}
