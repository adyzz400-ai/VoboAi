// language: JavaScript (ESM), file: platforms/sparx/parser.js
export function parseSparxQuestion(buffer) {
  const str = buffer.toString('utf8');
  const start = str.indexOf('{"layout"');
  const end = str.lastIndexOf('}');
  
  if (start === -1 || end === -1) throw new Error('Could not find JSON layout');
  
  const data = JSON.parse(str.slice(start, end + 1));
  const prompt = data.layout.content[0].content[0].content[0].text;
  
  const choicesObj = data.layout.content[1].content[0].content;
  const choices = choicesObj.map(c => ({
    ref: c.ref,
    text: c.content[0].text
  }));

  const actMatch = str.match(/\/activities\/([a-z0-9-]+)/);
  const activityId = actMatch ? actMatch[1] : null;

  return { prompt, choices, activityId };
}

export function parseBookworkCode(buffer) {
  const str = buffer.toString('utf8');
  const match = str.match(/<choice>(.*?)<\/choice>/) || str.match(/<number>(.*?)<\/number>/);
  if (match) return match[1];
  return null;
}

export function parseHomeworkList(buffer) {
  const str = buffer.toString('utf8');
  const tasks = [];
  const pkgRegex = /packages\/([0-9a-f-]{36})/g;
  let match;
  
  while ((match = pkgRegex.exec(str)) !== null) {
    const packageId = match[1];
    const taskStr = str.slice(match.index, match.index + 200);
    const taskMatch = taskStr.match(/tasks\/([0-9a-f-]{36})/);
    const taskId = taskMatch ? taskMatch[1] : packageId;
    
    tasks.push({
      packageId,
      taskId,
      title: 'Task ' + (tasks.length + 1),
      questionCount: 10,
      correctCount: 0,
      status: 'new'
    });
  }
  
  return tasks;
}
