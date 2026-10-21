// language: JavaScript (ESM), file: platforms/sparx/parser.js

function readVarint(buf, pos) {
  let result = 0n, shift = 0n, byte;
  do { byte = buf[pos++]; result |= BigInt(byte & 0x7f) << shift; shift += 7n; if (shift > 70n) throw new Error('varint too long'); } while (byte & 0x80);
  return { value: result, pos };
}

function* fields(buf, start = 0, end = buf.length) {
  let pos = start;
  while (pos < end) {
    const { value: key, pos: p1 } = readVarint(buf, pos); pos = p1;
    const tag = Number(key >> 3n), wt = Number(key & 7n);
    let ps = pos, pe = pos;
    if (wt === 0) pe = readVarint(buf, pos).pos;
    else if (wt === 1) pe = pos + 8;
    else if (wt === 2) { const { value: len, pos: p2 } = readVarint(buf, pos); ps = p2; pe = p2 + Number(len); }
    else if (wt === 5) pe = pos + 4;
    else return;
    yield { tag, wt, payloadStart: ps, payloadEnd: pe };
    pos = pe;
  }
}

function sub(buf, f) { return buf.subarray(f.payloadStart, f.payloadEnd); }
function str(buf, f) { return sub(buf, f).toString('utf8'); }

function byTag(buf, start, end) {
  const m = new Map();
  for (const f of fields(buf, start, end)) {
    if (!m.has(f.tag)) m.set(f.tag, []);
    m.get(f.tag).push(f);
  }
  return m;
}

function unframe(buf) {
  if (!buf || buf.length < 5) return buf;
  if (buf[0] & 0x80) return Buffer.alloc(0);
  const len = buf.readUInt32BE(1);
  return (5 + len <= buf.length) ? buf.subarray(5, 5 + len) : buf.subarray(5);
}

function extractTasksFromBytes(pkgBytes) {
  const tasks = [];
  const seenTasks = new Set();
  const pm = byTag(pkgBytes, 0, pkgBytes.length);
  
  for (const tf of pm.get(11) || []) {
    const tBytes = sub(pkgBytes, tf);
    const tm = byTag(tBytes, 0, tBytes.length);
    const tPath = (tm.get(1) || [])[0];
    if (!tPath) continue;
    const tMatch = str(tBytes, tPath).match(/tasks\/([0-9a-f-]{36})/i);
    if (!tMatch) continue;
    const taskId = tMatch[1].toLowerCase();
    if (seenTasks.has(taskId)) continue;
    seenTasks.add(taskId);

    const taskTitle = ((tm.get(2) || [])[0] && str(tBytes, (tm.get(2) || [])[0])) || 'Task';
    
    // Real accuracy: count items with lastCorrect
    const tStr = tBytes.toString('utf8');
    const totalItems = (tStr.match(/items\//g) || []).length || 1;
    const completedItems = (tStr.match(/lastCorrect/g) || []).length;
    const accuracy = Math.round((completedItems / totalItems) * 100) + '%';

    tasks.push({
      taskId, title: taskTitle,
      isFlashcards: /flash\s*cards?/i.test(taskTitle),
      isTimesTables: /times\s*tables/i.test(taskTitle),
      hasBookworkCheck: !/flash\s*cards?/i.test(taskTitle) && !/times\s*tables/i.test(taskTitle),
      accuracy
    });
  }

  if (tasks.length === 0) {
    const re = /tasks\/([0-9a-f-]{36})/gi;
    let m, i = 1;
    while ((m = re.exec(pkgBytes.toString('utf8'))) !== null) {
      const id = m[1].toLowerCase();
      if (seenTasks.has(id)) continue;
      seenTasks.add(id);
      const win = pkgBytes.toString('utf8').slice(Math.max(0, m.index - 80), m.index + 80);
      let taskTitle = 'Task ' + i, isTimesTables = false, isFlashcards = false;
      if (/times\s*tables/i.test(win)) { taskTitle = 'Times Tables'; isTimesTables = true; }
      else if (/flash\s*cards?/i.test(win)) { taskTitle = 'Flashcards'; isFlashcards = true; }
      tasks.push({ taskId: id, title: taskTitle, isFlashcards, isTimesTables, hasBookworkCheck: !isFlashcards && !isTimesTables, accuracy: '0%' });
      i++;
    }
  }

  // Package accuracy
  let totalCompleted = 0;
  tasks.forEach(t => { totalCompleted += parseInt(t.accuracy) || 0; });
  const pkgAccuracy = tasks.length > 0 ? Math.round(totalCompleted / tasks.length) + '%' : '0%';

  return { tasks, accuracy: pkgAccuracy };
}

export function parseSparxQuestion(buffer) {
  const framed = unframe(buffer);
  const s = framed.toString('utf8');
  const jStart = s.indexOf('[{"layout"');
  const start = jStart !== -1 ? jStart : s.indexOf('{"layout"');
  if (start === -1) throw new Error('Could not find JSON layout');

  let depth = 0, jEnd = -1;
  const openChar = s[start] === '[' ? '[' : '{';
  const closeChar = openChar === '[' ? ']' : '}';
  for (let i = start; i < s.length; i++) {
    if (s[i] === openChar) depth++;
    else if (s[i] === closeChar) { depth--; if (depth === 0) { jEnd = i + 1; break; } }
  }

  const parsed = JSON.parse(s.slice(start, jEnd));
  const layout = Array.isArray(parsed) ? parsed[0] : parsed;
  const actMatch = s.match(/\/activities\/([a-z0-9-]{36})/);
  const activityId = actMatch ? actMatch[1] : null;
  const root = layout.layout || layout;

  const promptParts = [], choices = [], slots = [], textFields = [];
  let imageUrl = null;
  const imgMatch = s.match(/"src"\s*:\s*"([^"]+)"/);
  if (imgMatch) imageUrl = imgMatch[1];

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.element === 'text') { promptParts.push(node.text); return; }
    if (node.element === 'image' || node.element === 'img') { if (node.src) imageUrl = node.src; return; }
    if (node.element === 'card' || node.element === 'choice') {
      choices.push({ ref: node.ref, text: (node.content && node.content[0] && node.content[0].text) || '' });
      return;
    }
    if (node.element === 'slot') { slots.push({ ref: node.ref, accept: node.accept }); promptParts.push('___'); return; }
    if (node.element === 'text-field' || node.element === 'number-field') { 
      textFields.push({ ref: node.ref, kind: node.element }); promptParts.push('___'); return; 
    }
    if (node.content) node.content.forEach(walk);
  }
  walk(root);

  const prompt = promptParts.join(' ').replace(/\s+/g, ' ').trim();

  if (textFields.length > 0) {
    // It's a multi-part question (1a, 1b). Return all fields in order.
    return { prompt, choices: [], textFields, image: imageUrl, activityId, type: 'text' };
  }
  if (slots.length > 0) {
    return { prompt, choices, slots, image: imageUrl, activityId, type: 'slot' };
  }
  return { prompt, choices, image: imageUrl, activityId, type: 'multiple' };
}

export function parseBookworkCode(buffer) {
  const s = unframe(buffer).toString('utf8');
  const m = s.match(/<choice>(.*?)<\/choice>/) || s.match(/<number>(.*?)<\/number>/);
  return m ? m[1] : null;
}

export function parseGetPackage(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  const raw = unframe(buffer);

  let pkgBytes = null;
  const top = byTag(raw, 0, raw.length);
  const f = (top.get(1) || [])[0];
  if (f && f.wt === 2) pkgBytes = sub(raw, f);
  if (!pkgBytes) return null;

  const pm = byTag(pkgBytes, 0, pkgBytes.length);
  const pathF = (pm.get(1) || [])[0];
  if (!pathF) return null;
  const pathStr = str(pkgBytes, pathF);
  const pkgMatch = pathStr.match(/packages\/([0-9a-f-]{36})/i);
  if (!pkgMatch) return null;
  const packageId = pkgMatch[1].toLowerCase();

  let title = 'Homework';
  const titleF = (pm.get(2) || [])[0];
  if (titleF) {
    const t = str(pkgBytes, titleF).trim();
    if (t) title = t.replace(/^[^A-Za-z0-9]+/, '').trim() || 'Homework';
  }

  // REAL DUE DATE: nested timestamp in tag 6 (seconds)
  let dueDateMs = null;
  for (const field of pm.get(6) || []) {
    if (field.wt === 2) {
      const nested = byTag(pkgBytes, field.payloadStart, field.payloadEnd);
      const secField = (nested.get(1) || [])[0];
      if (secField && secField.wt === 0) {
        const sec = Number(readVarint(pkgBytes, secField.payloadStart).value);
        if (sec > 1700000000 && sec < 2000000000) { dueDateMs = sec * 1000; break; }
      }
    }
  }
  const dueDate = dueDateMs ? new Date(dueDateMs).toISOString() : null;

  const { tasks, accuracy } = extractTasksFromBytes(pkgBytes);

  return { packageId, title, dueDate, tasks, accuracy };
}

export function parseHomeworkList(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return [];
  const raw = unframe(buffer);
  const packages = [];
  const seen = new Set();
  const top = byTag(raw, 0, raw.length);
  
  for (const f of top.get(1) || []) {
    const pkgBytes = sub(raw, f);
    const pm = byTag(pkgBytes, 0, pkgBytes.length);
    const pathF = (pm.get(1) || [])[0];
    if (!pathF) continue;
    const pkgMatch = str(pkgBytes, pathF).match(/packages\/([0-9a-f-]{36})/i);
    if (!pkgMatch) continue;
    const packageId = pkgMatch[1].toLowerCase();
    if (seen.has(packageId)) continue;
    seen.add(packageId);
    packages.push({ packageId, title: 'Homework', dueDate: null, tasks: [], accuracy: '0%' });
  }
  return packages;
}
