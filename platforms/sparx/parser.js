// language: JavaScript (ESM), file: platforms/sparx/parser.js

function readVarint(buf, offset) {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
    if (shift > 70n) throw new Error('varint too long');
  }
  return { value: result, next: pos };
}

function walkProtobuf(buf, depth, maxDepth) {
  if (depth === undefined) depth = 0;
  if (maxDepth === undefined) maxDepth = 6;
  const fields = [];
  let pos = 0;
  const end = buf.length;

  while (pos < end) {
    try {
      const tagRes = readVarint(buf, pos);
      pos = tagRes.next;
      const tag = Number(tagRes.value);
      const fieldNumber = tag >>> 3;
      const wireType = tag & 0x7;

      if (wireType === 0) {
        const v = readVarint(buf, pos);
        pos = v.next;
        fields.push({
          fieldNumber: fieldNumber,
          wireType: 0,
          value: Number(v.value)
        });
      } else if (wireType === 1) {
        if (pos + 8 > end) break;
        pos += 8;
        fields.push({ fieldNumber: fieldNumber, wireType: 1 });
      } else if (wireType === 2) {
        const lenRes = readVarint(buf, pos);
        pos = lenRes.next;
        const len = Number(lenRes.value);
        if (len < 0 || pos + len > end) break;
        const slice = buf.subarray(pos, pos + len);
        pos += len;

        let asString = null;
        try {
          const s = Buffer.from(slice).toString('utf8');
          if (s.length > 0 && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(s)) {
            asString = s;
          }
        } catch (_) {}

        const entry = {
          fieldNumber: fieldNumber,
          wireType: 2,
          string: asString,
          nested: null
        };

        if (!asString && depth < maxDepth && len > 0) {
          try {
            entry.nested = walkProtobuf(slice, depth + 1, maxDepth);
          } catch (_) {}
        }

        fields.push(entry);
      } else if (wireType === 5) {
        if (pos + 4 > end) break;
        pos += 4;
        fields.push({ fieldNumber: fieldNumber, wireType: 5 });
      } else {
        break;
      }
    } catch (_) {
      break;
    }
  }
  return fields;
}

function timestampFromField(f) {
  if (!f || !f.nested) return null;
  let seconds = null;
  for (const s of f.nested) {
    if (s.fieldNumber === 1 && s.wireType === 0) {
      seconds = s.value;
      break;
    }
  }
  if (seconds == null) return null;
  try {
    return new Date(seconds * 1000);
  } catch (_) {
    return null;
  }
}

function packagesFromRawWalk(fields) {
  const packages = [];

  for (const top of fields) {
    if (top.fieldNumber !== 1 || !top.nested) continue;

    const pkg = {
      packageID: null,
      title: 'Homework',
      dueDate: null,
      numTaskItems: 0,
      numTaskItemsDone: 0,
      numTasks: 0,
      numTasksComplete: 0,
      percent: 0
    };

    let targetXp = null;
    let doneXp = null;

    for (const f of top.nested) {
      if (f.fieldNumber === 1 && f.string) {
        const m = f.string.match(/packages\/([0-9a-f-]{36})/i);
        if (m) pkg.packageID = m[1];
        continue;
      }

      if (f.fieldNumber === 2 && f.string) {
        const raw = f.string.trim();
        const dueMatch = raw.match(/^(.+?)\s+due\s+(.+)$/i);
        if (dueMatch) {
          pkg.title =
            dueMatch[1].replace(/^[^A-Za-z0-9]+/, '').trim() || 'Homework';
        } else if (raw.length > 0 && raw.length < 80) {
          pkg.title = raw.replace(/^[^A-Za-z0-9]+/, '').trim() || 'Homework';
        }
        continue;
      }

      if (f.fieldNumber === 4 && f.string) {
        pkg.title = f.string.trim() || pkg.title;
        continue;
      }

      if (f.fieldNumber === 6 && f.wireType === 0) {
        pkg.numTasks = f.value;
        continue;
      }
      if (f.fieldNumber === 7 && f.wireType === 0) {
        pkg.numTaskItems = f.value;
        continue;
      }
      if (f.fieldNumber === 8 && f.wireType === 0) {
        pkg.numTaskItemsDone = f.value;
        continue;
      }
      if (f.fieldNumber === 10 && f.wireType === 0) {
        pkg.numTasksComplete = f.value;
        continue;
      }

      if (f.fieldNumber === 9 && f.nested) {
        const d = timestampFromField(f);
        if (d) pkg.dueDate = d;
        continue;
      }

      // XP-style nested scores (older builds)
      if (f.fieldNumber === 6 && f.nested) {
        for (const s of f.nested) {
          if (s.fieldNumber === 1 && s.nested) {
            for (const t of s.nested) {
              if (t.fieldNumber === 1 && t.wireType === 1) {
                // skip
              }
            }
          }
        }
      }
    }

    if (targetXp && targetXp > 0) {
      pkg.numTaskItems = Math.round(targetXp);
      pkg.numTasks = pkg.numTaskItems;
      if (doneXp != null) {
        pkg.numTaskItemsDone = Math.round(doneXp);
        pkg.numTasksComplete = pkg.numTaskItemsDone;
        pkg.percent = Math.min(
          100,
          Math.round((doneXp / targetXp) * 100)
        );
      }
    }

    if (pkg.numTaskItems > 0 && pkg.numTasks === 0) {
      pkg.numTasks = pkg.numTaskItems;
    }
    if (pkg.numTaskItemsDone > 0 && pkg.numTaskItems > 0) {
      pkg.percent = Math.min(
        100,
        Math.round((pkg.numTaskItemsDone / pkg.numTaskItems) * 100)
      );
    }

    if (pkg.packageID) packages.push(pkg);
  }

  return packages;
}

function stripGrpcFrame(buffer) {
  if (!buffer || buffer.length < 5) return buffer;
  // gRPC-web: 1 byte flag + 4 byte BE length
  const flag = buffer[0];
  if (flag === 0x00 || flag === 0x01) {
    const len = buffer.readUInt32BE(1);
    if (len > 0 && len + 5 <= buffer.length) {
      return buffer.subarray(5, 5 + len);
    }
  }
  return buffer;
}

export function parseHomeworkList(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return [];
  }

  const payload = stripGrpcFrame(buffer);
  let rawFields = [];
  try {
    rawFields = walkProtobuf(payload);
  } catch (_) {
    rawFields = [];
  }

  let rawPackages = packagesFromRawWalk(rawFields);

  // string fallback if walk found nothing
  if (rawPackages.length === 0) {
    const str = payload.toString('utf8');
    const re = /packages\/([0-9a-f-]{36})/gi;
    let m;
    const seen = new Set();
    while ((m = re.exec(str)) !== null) {
      const id = m[1].toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      rawPackages.push({
        packageID: id,
        title: 'Homework',
        dueDate: null,
        numTasks: 0,
        numTaskItems: 0,
        numTaskItemsDone: 0,
        numTasksComplete: 0,
        percent: 0
      });
    }
  }

  const out = [];
  for (const p of rawPackages) {
    const taskCount = Math.max(p.numTasks || 0, p.numTaskItems || 0, 1);
    const tasks = [];
    for (let i = 1; i <= taskCount; i++) {
      tasks.push({
        taskId: p.packageID + '-task-' + i,
        title: 'Task ' + i,
        isTimesTables: false,
        isFlashcards: false
      });
    }

    const due =
      p.dueDate instanceof Date
        ? p.dueDate.toISOString()
        : new Date(Date.now() + 7 * 86400000).toISOString();

    out.push({
      packageId: p.packageID,
      rawPackageId: p.packageID,
      title: p.title || 'Homework',
      dueDate: due,
      accuracy: String(p.percent || 0) + '%',
      tasks: tasks,
      numTasks: taskCount,
      numTaskItems: p.numTaskItems || taskCount,
      numTaskItemsDone: p.numTaskItemsDone || 0
    });
  }

  return out;
}

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
