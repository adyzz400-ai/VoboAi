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

  const layoutType = (data.layout && data.layout.type) ? data.layout.type : [];
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

  // standard multiple choice
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
  const str = buffer.toString('utf8');
  const packages = [];

  const blocks = str.split(/-packages\//);
  if (blocks.length < 2) return packages;

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    const pkgMatch = block.match(
      /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (!pkgMatch) continue;
    const packageId = pkgMatch[1];

    let assignmentId = packageId;
    const assignMatch = block.match(
      /assignments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (assignMatch) assignmentId = assignMatch[1];

    let title = 'Homework';
    if (block.includes('Homework')) title = 'Homework';

    const tasks = [];
    const taskRegex =
      /tasks\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
    const taskIds = [];
    let m;
    while ((m = taskRegex.exec(block)) !== null) {
      taskIds.push({ id: m[1], index: m.index });
    }

    for (let t = 0; t < taskIds.length; t++) {
      const start = taskIds[t].index;
      const end =
        t + 1 < taskIds.length ? taskIds[t + 1].index : block.length;
      const chunk = block.slice(start, end);

      let taskTitle = 'Task';
      let isTimesTables = false;
      let isFlashcards = false;

      if (/Times\s*Tables/i.test(chunk)) {
        taskTitle = 'Times Tables';
        isTimesTables = true;
      } else if (/Flashcards?/i.test(chunk)) {
        taskTitle = 'Flashcards';
        isFlashcards = true;
      } else {
        const nameMatch = chunk.match(/Task\s*(\d+)/i);
        if (nameMatch) taskTitle = 'Task ' + nameMatch[1];
        else if (/Homework/i.test(chunk)) taskTitle = 'Homework';
      }

      tasks.push({
        taskId: taskIds[t].id,
        title: taskTitle,
        isTimesTables: isTimesTables,
        isFlashcards: isFlashcards
      });
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
      title: title,
      dueDate: dueDate,
      accuracy: '0%',
      tasks: tasks
    });
  }

  return packages;
}
