export function parseHomeworkList(buffer) {
  const str = buffer.toString('utf8');
  const packages = [];

  // split on the package marker that appears in the grpc blob
  const blocks = str.split(/-packages\//);
  if (blocks.length < 2) return packages;

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // package uuid is the first 36-char hex after the split
    const pkgMatch = block.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (!pkgMatch) continue;
    const packageId = pkgMatch[1];

    // assignment id (preferred for later GetActivity calls)
    let assignmentId = packageId;
    const assignMatch = block.match(/assignments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (assignMatch) assignmentId = assignMatch[1];

    // title — prefer explicit "Homework" label, fall back to package
    let title = 'Homework';
    if (block.includes('Homework')) title = 'Homework';

    // extract every task uuid + the chunk that follows it
    const tasks = [];
    const taskRegex = /tasks\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
    let m;
    const taskIds = [];
    while ((m = taskRegex.exec(block)) !== null) {
      taskIds.push({ id: m[1], index: m.index });
    }

    for (let t = 0; t < taskIds.length; t++) {
      const start = taskIds[t].index;
      const end = t + 1 < taskIds.length ? taskIds[t + 1].index : block.length;
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
        isTimesTables,
        isFlashcards
      });
    }

    // due date — look for common patterns, else +7 days
    let dueDate = new Date(Date.now() + 7 * 86400000).toISOString();
    const dueMatch = block.match(/(\d{4}-\d{2}-\d{2})/);
    if (dueMatch) {
      try {
        dueDate = new Date(dueMatch[1]).toISOString();
      } catch (_) {}
    }

    packages.push({
      packageId: assignmentId,   // use assignment id for later API calls
      rawPackageId: packageId,
      title: title,
      dueDate: dueDate,
      accuracy: '0%',
      tasks: tasks
    });
  }

  return packages;
}
