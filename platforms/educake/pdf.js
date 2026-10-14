// language: JavaScript (ESM), file: platforms/educake/pdf.js
// *pdfkit session summary. Streams to a Buffer — no disk on Render.*
import PDFDocument from 'pdfkit';

export async function buildSessionPdf(summary) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fmt = (n) => `${n}`;
      const pct = summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0;

      doc.fontSize(20).fillColor('#111827').text('Vobo AI — session summary', { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(12).fillColor('#374151').text(summary.quizTitle);
      doc.fontSize(10).fillColor('#6B7280').text(new Date().toISOString());
      doc.moveDown(1);

      doc.fontSize(13).fillColor('#111827').text('Score');
      doc.fontSize(11).fillColor('#374151').text(`${summary.correct} / ${summary.total}  ·  ${pct}%`);
      doc.text(`Correct: ${fmt(summary.correct)}    Incorrect: ${fmt(summary.incorrect)}    Unmarked: ${fmt(summary.unmarked)}`);
      if (summary.cancelled) doc.fillColor('#B91C1C').text('Run cancelled before completion.');
      doc.moveDown(1);

      doc.fontSize(13).fillColor('#111827').text('Questions');
      doc.moveDown(0.4);

      summary.results.forEach((r, i) => {
        const mark = r.result === true ? '✓' : r.inReview ? '?' : '✗';
        doc.fontSize(11).fillColor('#111827').text(`${mark}  Q${i + 1}. ${r.prompt}`, { width: 500 });
        doc.fontSize(10).fillColor('#374151').text(`Your answer: ${r.given || '(blank)'}`);
        if (!r.result && r.correctAnswers?.length) {
          doc.fillColor('#B91C1C').text(`Correct: ${r.correctAnswers.join(' / ')}`);
        }
        if (r.reasoning) doc.fillColor('#4B5563').text(`Reasoning: ${r.reasoning}`, { width: 500 });
        if (r.image) doc.fillColor('#6B7280').text(`Image: ${r.image}`);
        doc.moveDown(0.6);
      });

      doc.end();
    } catch (err) { reject(err); }
  });
}
