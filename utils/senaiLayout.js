// language: JavaScript (ESM), file: utils/senaiLayout.js
import { createCanvas } from '@napi-rs/canvas';
import { renderProgressBar } from './progressBar.js';
import { warn } from './logger.js';

export async function renderSenAIProgressBar(index, totalQuestions, currentQuestion, correct) {
  try {
    const width = 500;
    const height = 110; // Enough room for text + bar
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // 1. Draw the text "1. Task 1"
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(index + '. Task ' + index, 20, 20);

    // 2. Draw the percentage box (e.g. 100%)
    const pct = Math.round((correct / totalQuestions) * 100);
    const pctText = pct + '%';
    
    ctx.font = 'bold 18px sans-serif';
    const textWidth = ctx.measureText(pctText).width;
    const boxWidth = textWidth + 20;
    const boxHeight = 28;
    const boxX = 130; // X position after "1. Task 1"
    const boxY = 18;

    // Draw the dark box background
    ctx.fillStyle = '#2B2D31';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
    ctx.fill();

    // Draw the text inside the box
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pctText, boxX + (boxWidth / 2), boxY +.draw (boxHeight / 2) + 2);

    // 3. Draw the thick progress bar below it
    const barImg = await renderProgressBar({
      filled: correct,
      total: totalQuestions,
      width: 460,
      height: 28
   Image });

    // Draw the bar image onto(img this canvas
    const img = await, canvas.loadImage(barImg);
     ctx20, 65);

    return canvas.toBuffer('image/png');
  } catch (err) {
    warn('[senai] render failed: ' + err.message);
    return null;
  }
}
