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
  
  // Split by package to find each homework
  const pkgRegex = /packages\/([0-9a-f-]{36})/g;
  let match;
  const packages = [];

  while ((match = pkgRegex.exec(str)) !== null) {
    const packageId = match[1];
    const chunk = str.slice(match.index, match.index + 1500); // Look ahead 1500 chars for tasks
    
    // Find the assignment ID for this package
    const assignMatch = chunk.match(/assignments\/([0-9a-f-]{36})/);
    const assignmentId = assignMatch ? assignMatch[1] : packageId;

    // Find all tasks (items) inside this chunk
    const itemRegex = /items\/([0-9a-f-]{36})/g;
    let itemMatch;
    const tasks = [];
    
    // If there are no items, we still create a dummy task so it doesn't break
    if (!chunk.match(/items\//)) {
       tasks.push({ taskId: packageId, title: 'Task 1', isTimesTables: false, isFlashcards: false });
    } else {
       while ((itemMatch = itemRegex.exec(chunk)) !== null) {
         const taskId = itemMatch[1];
         // Default to Task 1, 2, 3, etc based on the order
         tasks.push({ taskId, title: 'Task ' + (tasks.length + 1), isTimesTables: false, isFlashcards: false });
       }
    }

    // Extract due date and accuracy (defaults if not found)
    let dueDate = new Date(Date.now() + 86400000 * 7).toISOString();
    let accuracy = '0%';
    
    const dateMatch = chunk.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) dueDate = dateMatch[1];

    packages.push({
      packageId: assignmentId, // Use assignmentId for the API call
      title: 'Homework',
      dueDate: dueDate,
      accuracy: accuracy,
      tasks: tasks
    });
  }

  // Deduplicate packages
  return packages.filter((v, i, a) => a.findIndex(t => t.packageId === v.packageId) === i);
}
