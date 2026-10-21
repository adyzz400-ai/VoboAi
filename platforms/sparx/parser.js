// language: JavaScript (ESM), file: platforms/sparx/parser.js

function readVarint(buf, pos) {
  let result = 0n;
  let shift = 0n;
  let byte;
  do {
    byte = buf[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
    if (shift > 70n) throw new Error('varint too long');
  } while (byte & 0x80);
  return { value: result, pos };
}

function* fields(buf, start, end) {
  if (start === undefined) start = 0;
  if (end === undefined) end = buf.length;
  let pos = start;
  while (pos < end) {
    const { value: key, pos: p1 } = readVarint(buf, pos);
    pos = p1;
    const tag = Number(key >> 3n);
    const wt = Number(key & 7n);
    let ps = pos;
    let pe = pos;
    if (wt === 0) {
      pe = readVarint(buf, pos).pos;
    } else if (wt === 1) {
      pe = pos + 8;
    } else if (wt === 2) {
      const { value: len, pos: p2 } = readVarint(buf, pos);
      ps = p2;
      pe = p2 + Number(len);
    } else if (wt === 5) {
      pe = pos + 4;
    } else {
      return;
    }
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
  if (5 + len <= buf.length) return buf.subarray(5, 5 + len);
  return buf.subarray(5);
}

export function parseSparxQuestion(buffer) {
  const framed = unframe(buffer);
  const s = framed.toString('utf8');
  const jStart = s.indexOf('[{"layout"');
  const jStartAlt = s.indexOf('{"layout"');
  const start = jStart !== -1 ? jStart : jStartAlt !== -1 ? jStartAlt : -1;
  if (start === -1) throw new Error('Could not find JSON layout');

  let depth = 0;
  let jEnd = -1;
  const openChar = s[start] === '[' ? '[' : '{';
  const closeChar = openChar === '[' ? ']' : '}';
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) { jEnd = i + 1; break; }
    }
  }
  if (jEnd === -1) throw new Error('Could not find JSON close');

  const parsed = JSON.parse(s.slice(start, jEnd));
  const layout = Array.isArray(parsed) ? parsed[0] : parsed;

  const actMatch = s.match(/\/activities\/([a-z0-9-]{36})/);
  const activityId = actMatch ? actMatch[1] : null;

  const root = layout.layout || layout;
  if (!root) throw new Error('No layout root');

  const promptParts = [];
  const choices = [];
  const slots = [];

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.element === 'text' && typeof node.text === 'string') { promptParts.push(node.text); return; }
    if (node.element === 'card' || node.element === 'choice') {
      choices.push({ ref: node.ref, text: (node.content && node.content[0] && node.content[0].text) || '' });
      return;
    }
    if (node.element === 'slot') { slots.push({ ref: node.ref, accept: node.accept }); promptParts.push('___'); return; }
    if (node.element === 'text-field' || node.element === 'number-field') {
      slots.push({ ref: node.ref, kind: node.element }); promptParts.push('___'); return;
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  }
  walk(root);

  const prompt = promptParts.join(' ').replace(/\s+/g, ' ').trim();

  const numFields = Object.keys((root.input && root.input.number_fields) || {});
  const txtFields = Object.keys((root.input && root.input.text_fields) || {});
  if (numFields.length > 0 || txtFields.length > 0) {
    const ref = numFields[0] || txtFields[0];
    return { prompt, choices: [], textField: { ref, kind: numFields.length > 0 ? 'number' : 'text' }, activityId, type: 'text' };
  }
  if (slots.length > 0) return { prompt, choices, slots, activityId, type: 'slot' };
  return { prompt, choices, activityId, type: 'multiple' };
}

export function parseBookworkCode(buffer) {
  const s = unframe(buffer).toString('utf8');
  const m = s.match(/<choice>(.*?)<\/choice>/) || s.match(/<number>(.*?)<\/number>/);
  return m ? m[1] : null;
}

export function parseHomeworkList(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return [];

  const raw = unframe(buffer);

  // Diagnostic: one-time log so the next run reveals the actual outer shape.
  try {
    console.log('RAW head:', raw.subarray(0, 80).toString('utf8').replace(/[^\x20-\x7e]/g, '.'));
    const outer = byTag(raw, 0, raw.length);
    for (const [tag, fs] of outer) {
      for (const f of fs) {
        let v = '?';
        if (f.wt === 0) v = Number(readVarint(raw, f.payloadStart).value);
        else if (f.wt === 1) v = Number(raw.readBigUInt64LE(f.payloadStart));
        else if (f.wt === 2) v = sub(raw, f).toString('utf8').slice(0, 60).replace(/[^\x20-\x7e]/g, '.');
        console.log(`TOP tag=${tag} wt=${f.wt} len=${f.payloadEnd - f.payloadStart} first=${v}`);
      }
    }
  } catch (e) { console.log('RAW debug failed:', e.message); }

  const packages = [];
  const seen = new Set();

  // Walk top-level and one level deep for a wrapper message.
  try {
    const top = byTag(raw, 0, raw.length);

    // Direct: packages at field 1 of the outer message.
    const directFields = top.get(1) || [];
    for (const f of directFields) {
      collectPackage(raw, f, packages, seen);
    }

    // Wrapper: packages inside a nested message.
    if (packages.length === 0) {
      for (const [tag, fs] of top) {
        for (const f of fs) {
          if (f.wt !== 2) continue;
          const inner = sub(raw, f);
          if (inner.length < 20) continue;
          const probe = inner.toString('utf8');
          if (!probe.includes('-packages/') && !probe.includes('assignments/')) continue;
          const innerMap = byTag(inner, 0, inner.length);
          for (const fi of innerMap.get(1) || []) {
            collectPackage(inner, fi, packages, seen);
          }
          if (packages.length > 0) break;
        }
        if (packages.length > 0) break;
      }
    }
  } catch (_) {}

  // String fallback: guarantees we don't return [] when the blob has ids.
  if (packages.length === 0) {
    const s = raw.toString('utf8');
    const re = /packages\/([0-9a-f-]{36})/gi;
    let m;
    while ((m = re.exec(s)) !== null) {
      const id = m[1].toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      packages.push({ packageId: id, assignmentId: id, title: 'Homework', dueDate: null, tasks: [] });
    }
  }

  return packages;
}

function collectPackage(buf, f, out, seen) {
  if (!f || f.wt !== 2) return;
  const pkgBytes = sub(buf, f);
  const pm = byTag(pkgBytes, 0, pkgBytes.length);

  const pathF = (pm.get(1) || [])[0];
  if (!pathF) return;
  const pathStr = str(pkgBytes, pathF);
  const pkgMatch = pathStr.match(/packages\/([0-9a-f-]{36})/i);
  if (!pkgMatch) return;
  const packageId = pkgMatch[1].toLowerCase();
  if (seen.has(packageId)) return;
  seen.add(packageId);

  let title = 'Homework';
  const titleF = (pm.get(2) || [])[0];
  if (titleF) {
    const t = str(pkgBytes, titleF).trim();
    if (t) title = t.replace(/^[^A-Za-z0-9]+/, '').trim() || 'Homework';
  }

  let assignmentId = packageId;
  for (const p of pm.get(4) || []) {
    const m = str(pkgBytes, p).match(/assignments\/([0-9a-f-]{36})/i);
    if (m) { assignmentId = m[1].toLowerCase(); break; }
  }

  out.push({ packageId, assignmentId, title, dueDate: null, tasks: [] });
}

export function parseGetPackage(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  const raw = unframe(buffer);
  const top = byTag(raw, 0, raw.length);
  const f = (top.get(1) || [])[0];
  if (!f) return null;

  const pkgBytes = sub(raw, f);
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

  let assignmentId = packageId;
  for (const p of pm.get(4) || []) {
    const m = str(pkgBytes, p).match(/assignments\/([0-9a-f-]{36})/i);
    if (m) { assignmentId = m[1].toLowerCase(); break; }
  }

  let dueDateMs = null;
  for (const tag of [2, 8, 10, 12, 14]) {
    for (const field of pm.get(tag) || []) {
      let n = null;
      if (field.wt === 0) n = Number(readVarint(pkgBytes, field.payloadStart).value);
      else if (field.wt === 1) { try { n = Number(pkgBytes.readBigUInt64LE(field.payloadStart)); } catch (_) {} }
      if (n && n > 1500000000000 && n < 4000000000000) { dueDateMs = n; break; }
    }
    if (dueDateMs) break;
  }
  const dueDate = dueDateMs ? new Date(dueDateMs).toISOString() : null;

  const tasks = [];
  const seenTasks = new Set();

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
    tasks.push({
      taskId,
      title: taskTitle,
      isFlashcards: /flash\s*cards?/i.test(taskTitle),
      isTimesTables: /times\s*tables/i.test(taskTitle),
      hasBookworkCheck: !/flash\s*cards?/i.test(taskTitle) && !/times\s*tables/i.test(taskTitle),
    });
  }

  if (tasks.length === 0) {
    const s = pkgBytes.toString('utf8');
    const re = /tasks\/([0-9a-f-]{36})/gi;
    let m;
    let i = 1;
    while ((m = re.exec(s)) !== null) {
      const id = m[1].toLowerCase();
      if (seenTasks.has(id)) continue;
      seenTasks.add(id);
      const win = s.slice(Math.max(0, m.index - 80), m.index + 80);
      let taskTitle = 'Task ' + i;
      let isTimesTables = false;
      let isFlashcards = false;
      if (/times\s*tables/i.test(win)) { taskTitle = 'Times Tables'; isTimesTables = true; }
      else if (/flash\s*cards?/i.test(win)) { taskTitle = 'Flashcards'; isFlashcards = true; }
      tasks.push({ taskId: id, title: taskTitle, isFlashcards, isTimesTables, hasBookworkCheck: !isFlashcards && !isTimesTables });
      i++;
    }
  }

  return { packageId, assignmentId, title, dueDate, tasks };
}
