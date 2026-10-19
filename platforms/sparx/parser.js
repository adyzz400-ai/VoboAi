// language: JavaScript (ESM), file: platforms/sparx/parser.js

export function parseSparxQuestion(buffer) {
  const str = buffer.toString('utf8');
  const start = str.indexOf('{"layout"');
  const end = str.lastIndexOf('}');

  if (start === -1 || end === -1) {
    throw new Error('Could not find JSON layout');
  }

  const data = JSON.parse(str.slice(start, end + 1));
  const actMatch = str.match(/\/activities\/([a-z0-9-]+)/);
  const activityId = actMatch ? actMatch[1] : null;

  const layoutType =
    data.layout && data.layout.type ? data.layout.type : [];
  const isSlot =
    layoutType.includes('multi-part') ||
    layoutType.includes('interleaved-question-answer');

  if (isSlot) {
    let prompt = '';
    let choices = [];

    try {
      const cardsGroup = data.layout.content[0];
      const partGroup = data.layout.content[1];

      if (cardsGroup && Array.isArray(cardsGroup.content)) {
        choices = cardsGroup.content.map((c) => {
          const text =
            c.content && c.content[0] && c.content[0].text
              ? c.content[0].text
              : '';
          return { ref: c.ref, text: text };
        });
      }

      if (partGroup && Array.isArray(partGroup.content)) {
        const parts = [];
        const walk = (nodes) => {
          if (!Array.isArray(nodes)) return;
          for (const n of nodes) {
            if (n.element === 'text' && n.text) parts.push(n.text);
            if (n.content) walk(n.content);
          }
        };
        walk(partGroup.content);
        prompt = parts.join(' ');
      }
    } catch (_) {
      prompt = 'Flashcard question';
    }

    return {
      prompt: prompt || 'Flashcard question',
      choices: choices,
      activityId: activityId,
      type: 'slot'
    };
  }

  let prompt = '';
  let choices = [];
  try {
    prompt = data.layout.content[0].content[0].content[0].text;
    const choicesObj = data.layout.content[1].content[0].content;
    choices = choicesObj.map((c) => ({
      ref: c.ref,
      text: c.content[0].text
    }));
  } catch (_) {
    prompt = 'Question';
    choices = [];
  }

  return {
    prompt: prompt,
    choices: choices,
    activityId: activityId,
    type: 'multiple'
  };
}

export function parseBookworkCode(buffer) {
  const str = buffer.toString('utf8');
  const match =
    str.match(/<choice>(.*?)<\/choice>/) ||
    str.match(/<number>(.*?)<\/number>/);
  if (match) return match[1];
  return null;
}

export function parseHomeworkList(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return [];
  }

  const str = buffer.toString('utf8');
  const packages = [];
  const uuidRe =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

  const rawBlocks = str.split(/packages\//i);
  const blocks = rawBlocks.length > 1 ? rawBlocks.slice(1) : [];

  for (const block of blocks) {
    const pkgMatch = block.match(
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (!pkgMatch) continue;
    const packageId = pkgMatch[1].toLowerCase();

    let assignmentId = packageId;
    const assignMatch = block.match(
      /assignments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (assignMatch) assignmentId = assignMatch[1].toLowerCase();

    // every uuid in this block
    const allIds = [];
    let m;
    const re = new RegExp(uuidRe.source, 'gi');
    while ((m = re.exec(block)) !== null) {
      allIds.push(m[0].toLowerCase());
    }

    // drop package + assignment → rest are task candidates
    const skip = new Set([packageId, assignmentId]);
    const taskIds = [];
    const seen = new Set();
    for (const id of allIds) {
      if (skip.has(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      taskIds.push(id);
    }

    // also catch explicit tasks/ paths
    const taskRe =
      /tasks\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
    let tm;
    while ((tm = taskRe.exec(block)) !== null) {
      const id = tm[1].toLowerCase();
      if (!seen.has(id)) {
        seen.add(id);
        taskIds.push(id);
      }
    }

    const tasks = [];
    let taskIndex = 1;
    for (const tid of taskIds) {
      const idx = block.toLowerCase().indexOf(tid);
      const window =
        idx >= 0 ? block.slice(Math.max(0, idx - 100), idx + 100) : block;

      let title = 'Task ' + taskIndex;
      let isTimesTables = false;
      let isFlashcards = false;

      if (/times\s*tables/i.test(window)) {
        title = 'Times Tables';
        isTimesTables = true;
      } else if (/flash\s*cards?/i.test(window)) {
        title = 'Flashcards';
        isFlashcards = true;
      } else {
        const num = window.match(/Task\s*(\d+)/i);
        if (num) title = 'Task ' + num[1];
      }

      tasks.push({
        taskId: tid,
        title: title,
        isTimesTables: isTimesTables,
        isFlashcards: isFlashcards
      });
      taskIndex++;
    }

    let dueDate = new Date(Date.now() + 7 * 86400000).toISOString();
    const dueMatch = block.match(/(\d{4}-\d{2}-\d{2})/);
    if (dueMatch) {
      try {
        dueDate = new Date(dueMatch[1]).toISOString();
      } catch (_) {}
    }

    packages.push({
      packageId: assignmentId,
      rawPackageId: packageId,
      title: 'Homework',
      dueDate: dueDate,
      accuracy: '0%',
      tasks: tasks
    });
  }

  return packages;
}
