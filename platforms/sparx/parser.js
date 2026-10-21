// language: JavaScript (ESM), file: platforms/sparx/parser.js

// --- protobuf walker ---
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
  const len = buf.readUInt32BE(1);
  return (5 + len <= buf.length) ? buf.subarray(5, 5 + len) : buf.subarray(5);
}

// --- question parser ---
export function parseSparxQuestion(buffer) {
  const framed = unframe(buffer);
  const s = framed.toString('utf8');
  const jStart = s.indexOf('[{"layout"');
  if (jStart === -1) throw new Error('Could not find JSON layout');
  let depth = 0, jEnd = -1;
  for (let i = jStart; i < s.length; i++) {
    const c = s[i];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { jEnd = i + 1; break; } }
  }
  if (jEnd === -1) throw new Error('Could not find JSON close');
  const layout = JSON.parse(s.slice(jStart, jEnd));

  const actMatch = s.match(/\/activities\/([a-z0-9-]{36})/);
  const activityId = actMatch ? actMatch[1] : null;

  const root = layout[0]?.layout ?? layout.layout;
  if (!root) throw new Error('No layout root');

  const promptParts = [];
  const choices = [];
  const slots = [];

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.element === 'text' && typeof node.text === 'string') { promptParts.push(node.text); return; }
    if (node.element === 'card' || node.element === 'choice') {
      choices.push({ ref: node.ref, text: node.content?.[0]?.text ?? '' });
      return;
    }
    if (node.element === 'slot') { slots.push({ ref: node.ref, accept: node.accept }); promptParts.push('___'); return; }
    if (node.element === 'text-field' || node.element === 'number-field') {
      slots.push({ ref: node.ref, kind: node.element });
      promptParts.push('___');
      return;
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  }
  walk(root);

  const prompt = promptParts.join(' ').replace(/\s+/g, ' ').trim();

  // Dispatch: text-field wins first, then card-slot, then MC
  const numFields = Object.keys(root.input?.number_fields || {});
  const txtFields = Object.keys(root.input?.text_fields || {});
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

// --- homework list parser (packages only; GetPackage enriches tasks) ---
export function parseHomeworkList(buffer) {
  const raw = unframe(buffer);
  const top = byTag(raw, 0, raw.length);
  const packages = [];

  for (const f of top.get(1) ?? []) {
    const pkgBytes = sub(raw, f);
    const pm = byTag(pkgBytes, 0, pkgBytes.length);

    const pathF = pm.get(1)?.[0];
    if (!pathF) continue;
    const pkgMatch = str(pkgBytes, pathF).match(/^-packages\/([0-9a-f-]{36})$/);
    if (!pkgMatch) continue;
    const packageId = pkgMatch[1];

    const title = (pm.get(2)?.[0] && str(pkgBytes, pm.get(2)[0])) || 'Homework';

    let assignmentId = null;
    for (const p of pm.get(4) ?? []) {
      const m = str(pkgBytes, p).match(/assignments\/([0-9a-f-]{36})$/);
      if (m) { assignmentId = m[1]; break; }
    }

    packages.push({ packageId, assignmentId: assignmentId || packageId, title, dueDate: null, tasks: [] });
  }
  return packages;
}

// --- GetPackage parser: real task tree + due date ---
export function parseGetPackage(buffer) {
  const raw = unframe(buffer);
  const top = byTag(raw, 0, raw.length);
  const f = top.get(1)?.[0];
  if (!f) return null;
  const pkgBytes = sub(raw, f);
  const pm = byTag(pkgBytes, 0, pkgBytes.length);

  const pathF = pm.get(1)?.[0];
  if (!pathF) return null;
  const pkgMatch = str(pkgBytes, pathF).match(/^-packages\/([0-9a-f-]{36})$/);
  if (!pkgMatch) return null;
  const packageId = pkgMatch[1];

  const title = (pm.get(2)?.[0] && str(pkgBytes, pm.get(2)[0])) || 'Homework';

  let assignmentId = null;
  for (const p of pm.get(4) ?? []) {
    const m = str(pkgBytes, p).match(/assignments\/([0-9a-f-]{36})$/);
    if (m) { assignmentId = m[1]; break; }
  }

  // Due-date: probe candidate tags. Real tag must be confirmed via one log pass;
  // probe list covers the millis-carrying fields visible in the captures.
  let dueDateMs = null;
  for (const tag of [2, 8, 10, 12, 14]) {
    for (const field of pm.get(tag) ?? []) {
      let n = null;
      if (field.wt === 0) n = Number(readVarint(pkgBytes, field.payloadStart).value);
      else if (field.wt === 1) n = Number(pkgBytes.readBigUInt64LE(field.payloadStart));
      if (n && n > 1_500_000_000_000 && n < 4_000_000_000_000) { dueDateMs = n; break; }
    }
    if (dueDateMs) break;
  }
  const dueDate = dueDateMs ? new Date(dueDateMs).toISOString() : null;

  const tasks = [];
  for (const tf of pm.get(11) ?? []) {
    const tBytes = sub(pkgBytes, tf);
    const tm = byTag(tBytes, 0, tBytes.length);
    const tPath = tm.get(1)?.[0];
    if (!tPath) continue;
    const tMatch = str(tBytes, tPath).match(/tasks\/([0-9a-f-]{36})$/);
    if (!tMatch) continue;
    const taskId = tMatch[1];
    const taskTitle = (tm.get(2)?.[0] && str(tBytes, tm.get(2)[0])) || 'Task';
    tasks.push({
      taskId,
      title: taskTitle,
      isFlashcards: taskTitle === 'Flashcards',
      isTimesTables: taskTitle === 'Times Tables',
      hasBookworkCheck: taskTitle !== 'Flashcards' && taskTitle !== 'Times Tables',
    });
  }

  return { packageId, assignmentId: assignmentId || packageId, title, dueDate, tasks };
}
