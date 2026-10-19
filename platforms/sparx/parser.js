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
  
  // Find the main package ID
  const pkgMatch = str.match(/packages\/([0-9a-f-]{36})/);
  if (!pkgMatch) return [];
  const packageId = pkgMatch[1];

  // Find all tasks inside the binary blob
  // The regex finds "tasks/uuid", then we look at the 50 chars after it for "Task 1", "Flashcards", etc.
  const taskRegex = /tasks\/([0-9a-f-]{36})/g;
  let match;
  const tasks = [];

  while ((match = taskRegex.exec(str)) !== null) {
    const taskId = match[1];
    
    // Look ahead to find the task name
    const chunk = str.slice(match.index, match.index + 150);
    
    let title = 'Task';
    let isTimesTables = false;
    let isFlashcards = false;

    if (chunk.includes('Times Tables')) {
      title = 'Times Tables';
      isTimesTables = true;
    } else if (chunk.includes('Flashcards')) {
      title = 'Flashcards';
      isFlashcards = true;
    } else {
      const matchTitle = chunk.match(/(Task \d+)/);
      if (matchTitle) title = matchTitle[1];
    }

    tasks.push({ taskId, title, isTimesTables, isFlashcards });
  }

  // Deduplicate (the binary sometimes repeats the same task ID for internal references)
  const uniqueTasks = tasks.filter((v, i, a) => a.findIndex(t => t.taskId === v.taskId) === i);

  // Try to find due date and accuracy in the JSON strings
  let dueDate = new Date(Date.now() + 86400000 * 7).toISOString(); // Default 1 week
  let accuracy = '0%';
  
  const dueMatch = str.match(/"dueDate":"(.*?)"/);
  if (dueMatch) dueDate = dueMatch[1];

  return [{
    packageId,
    title: 'Homework due ' + new Date(dueDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
    dueDate: dueDate,
    accuracy: accuracy,
    tasks: uniqueTasks
  }];
}
