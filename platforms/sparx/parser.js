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
  for (const f of fields(buf, start, end)) { if (!m.has(f.tag)) m.set(f.tag, []); m.get(f.tag).push(f); }
  return m;
}

function unframe(buf) {
  if (!buf || buf.length < 5) return buf;
  if (buf[0] & 0x80) return Buffer.alloc(0);
  let len = buf.readUInt32BE(1);
  let payload = (5 + len <= buf.length) ? buf.subarray(5, 5 + len) : buf.subarray(5);
  
  // Strip gRPC-Web trailer if present
  for (let i = 0; i <= payload.length - 5; i++) {
    if ((payload[i] & 0x80) === 0x80) {
      const trailerLen = payload.readUInt32BE(i + 1);
      if (i + 5 + trailerLen === payload.length) {
        return payload.subarray(0, i);
      }
    }
  }
  return payload;
}

function timestampFromField(buf, field) {
  if (!field || field.wt !== 2) return null;
  const nested = byTag(buf, field.payloadStart, field.payloadEnd);
  const secField = (nested.get(1) || [])[0];
  if (secField && secField.wt === 0) {
    const secs = Number(readVarint(buf, secField.payloadStart).value);
    if (secs > 1600000000 && secs < 2200000000) return new Date(secs * 1000);
  }
  return null;
}

function extractTasksFromBytes(pkgBytes) {
  const tasks = [];
  const seen = new Set();
  const pm = byTag(pkgBytes, 0, pkgBytes.length);

  for (const tf of pm.get(11) || []) {
    const tBytes = sub(pkgBytes, tf);
    const tm = byTag(tBytes, 0, tBytes.length);
    const tPath = (tm.get(1) || [])[0];
    if (!tPath) continue;
    const tMatch = str(tBytes, tPath).match(/tasks\/([0-9a-f-]{36})/i);
    if (!tMatch) continue;
    const taskId = tMatch[1].toLowerCase();
    if (seen.has(taskId)) continue;
    seen.add(taskId);

    const taskTitle = ((tm.get(2) || [])[0] && str(tBytes, (tm.get(2) || [])[0])) || 'Task';
    
    // Accuracy calculation from items
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
  return tasks;
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

  const promptParts = [], choices = [], slots = [], textFields = [], numberFields = [];
  let imageUrl = null;
  const imgMatch = s.match(/"src"\s*:\s*"([^"]+)"/);
  if (imgMatch) imageUrl = imgMatch[1];

  // Helper to find labels for number fields
  function walk(node, prevText = '') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { 
      let lastText = prevText;
      for (const child of node) {
        walk(child, lastText);
        if (child.element === 'text') lastText = child.text;
      }
      return; 
    }
    
    if (node.element === 'text') { promptParts.push(node.text); return; }
    if (node.element === 'image' || node.element === 'img') { if (node.src) imageUrl = node.src; return; }
    if (node.element === 'card' || node.element === 'choice') {
      choices.push({ ref: node.ref, text: (node.content && node.content[0] && node.content[0].text) || '' });
      return;
    }
    if (node.element === 'slot') { slots.push({ ref: node.ref, accept: node.accept }); promptParts.push('___'); return; }
    if (node.element === 'number-field') { 
      numberFields.push({ ref: node.ref, label: prevText }); promptParts.push('___'); return; 
    }
    if (node.element === 'text-field') { 
      textFields.push({ ref: node.ref }); promptParts.push('___'); return; 
    }
    if (node.content) {
      let lastText = prevText;
      for (const child of node.content) {
        walk(child, lastText);
        if (child.element === 'text') lastText = child.text;
      }
    }
  }
  walk(root);

  const prompt = promptParts.join(' ').replace(/\s+/g, ' ').trim();

  if (numberFields.length > 0) {
    return { prompt, choices: [], numberFields, image: imageUrl, activityId, type: 'number' };
  }
  if (textFields.length > 0) {
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
  const top = byTag(raw, 0, raw.length);
  let pkg = null;
  const tasks = [];

  for (const [tag, fs] of top) {
    for (const f of fs) {
      if (tag === 1 && !pkg) {
        const pkgBytes = sub(raw, f);
        const pm = byTag(pkgBytes, 0, pkgBytes.length);
        const pathF = (pm.get(1) || [])[0];
        if (pathF) {
          const m = str(pkgBytes, pathF).match(/packages\/([0-9a-f-]{36})/i);
          if (m) {
            const packageId = m[1].toLowerCase();
            let title = 'Homework';
            const titleF = (pm.get(2) || [])[0];
            if (titleF) {
              const t = str(pkgBytes, titleF).trim();
              const match = t.match(/^(.+?)\s+due\s+(.+)$/i);
              if (match) title = match[1].trim(); else title = t;
            }
            let dueDate = null;
            const dueField = (pm.get(9) || [])[0];
            if (dueField) {
              const d = timestampFromField(pkgBytes, dueField);
              if (d) dueDate = d.toISOString();
            }
            pkg = { packageId, title, dueDate, accuracy: '0%', tasks: [] };
          }
        }
      }
      if (tag === 2) {
        const tBytes = sub(raw, f);
        const tm = byTag(tBytes, 0, tBytes.length);
        const tPath = (tm.get(1) || [])[0];
        if (!tPath) continue;
        const tMatch = str(tBytes, tPath).match(/tasks\/([0-9a-f-]{36})/i);
        if (!tMatch) continue;
        const taskId = tMatch[1].toLowerCase();
        const taskTitle = ((tm.get(3) || [])[0] && str(tBytes, (tm.get(3) || [])[0])) || 'Task';
        const numItems = (tm.get(6) || [])[0] ? Number(readVarint(tBytes, tm.get(6)[0].payloadStart).value) : 10;
        const numDone = (tm.get(7) || [])[0] ? Number(readVarint(tBytes, tm.get(7)[0].payloadStart).value) : 0;
        const acc = Math.round((numDone / numItems) * 100);

        tasks.push({
          taskId, title: taskTitle,
          isFlashcards: /flash\s*cards?/i.test(taskTitle),
          isTimesTables: /times\s*tables/i.test(taskTitle),
          hasBookworkCheck: !/flash\s*cards?/i.test(taskTitle) && !/times\s*tables/i.test(taskTitle),
          accuracy: acc + '%'
        });
      }
    }
  }
  if (!pkg) return null;
  pkg.tasks = tasks;
  let totalDone = 0;
  tasks.forEach(t => { totalDone += parseInt(t.accuracy) || 0; });
  pkg.accuracy = tasks.length > 0 ? Math.round(totalDone / tasks.length) + '%' : '0%';
  return pkg;
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
