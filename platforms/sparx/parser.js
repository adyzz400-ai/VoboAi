// language: JavaScript (ESM), file: platforms/sparx/parser.js
export function parseSparxQuestion(buffer) {
  const str = buffer.toString('utf8');
  const start = str.indexOf('{"layout"');
  const end = str.lastIndexOf('}');
  
  if (start === -1 || end === -1) throw new Error('Could not find JSON layout');
  
  const data = JSON.parse(str.slice(start, end + 1));
  const actMatch = str.match(/\/activities\/([a-z0-9-]+)/);
  const activityId = actMatch ? actMatch[1] : null;

  if (data.layout.type.includes('multi-part') || data.layout.type.includes('interleaved-question-answer')) {
    const prompt = data.layout.content[1].content[0].content[0].text;
    const cardsObj = data.layout.content[0].content;
    const choices = cardsObj.map(c => ({ ref: c.ref, text: c.content[0].text }));
    return { prompt, choices, activityId, type: 'slot' };
  }

  const prompt = data.layout.content[0].content[0].content[0].text;
  const choicesObj = data.layout.content[1].content[0].content;
  const choices = choicesObj.map(c => ({ ref: c.ref, text: c.content[0].text }));
  return { prompt, choices, activityId, type: 'multiple' };
}

export function parseBookworkCode(buffer) {
  const str = buffer.toString('utf8');
  const match = str.match(/<choice>(.*?)<\/choice>/) || str.match(/<number>(.*?)<\/number>/);
  if (match) return match[1];
  return null;
}

export function parseHomeworkList(buffer) {
  const str = buffer.toString('utf8');
  const packages = [];
  
  const pkgBlocks = str.split(/-packages\//).slice(1);

  for (const block of pkgBlocks) {
    const pkgIdMatch = block.match(/^([0-9a-f-]{36})/);
    if (!pkgIdMatch) continue;
    const packageId = pkgIdMatch[1];

    const assignMatch = block.match(/\*0assignments\/([0-9a-f-]{36})/);
    const assignmentId = assignMatch ? assignMatch[1] : packageId;

    const taskRegex = /tasks\/([0-9a-f-]{36})(.*?)(?=tasks\/|items\/|$)/gs;
    let taskMatch;
    const tasks = [];

    while ((taskMatch = taskRegex.exec(block)) !== null) {
      const taskId = taskMatch[1];
      const taskChunk = taskMatch[2];
      
      let title = 'Task';
      let isTimesTables = false;
      let isFlashcards = false;

      if (taskChunk.includes('Times Tables')) { title = 'Times Tables'; isTimesTables = true; }
      else if (taskChunk.includes('Flashcards')) { title = 'Flashcards'; isFlashcards = true; }
      else {
        const nameMatch = taskChunk.match(/(Task \d+|Homework)/);
        if (nameMatch) title = nameMatch[1];
      }

      tasks.push({ taskId, title, isTimesTables, isFlashcards });
    }

    let dueDate = new Date(Date.now() + 86400000 * 7).toISOString();
    
    packages.push({
      packageId: assignmentId,
      title: 'Homework',
      dueDate: dueDate,
      accuracy: '0%',
      tasks: tasks
    });
  }

  return packages;
}
