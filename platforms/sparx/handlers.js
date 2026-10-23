// language: JavaScript (ESM), file: platforms/sparx/handlers.js
// ... (imports remain the same) ...

// Inside the 'sparx:login:submit' handler, after the loop that fetches packages:

              let taskCounter = 1;
              for (const pkg of baseList) {
                try {
                  const pkgBuffer = await client.getPackage(pkg.packageId);
                  const detailed = parseGetPackage(pkgBuffer);
                  if (detailed) {
                    pkg.dueDate = detailed.dueDate || pkg.dueDate;
                    pkg.title = detailed.title || pkg.title;
                    pkg.accuracy = detailed.accuracy || pkg.accuracy;
                    pkg.tasks = detailed.tasks || [];
                    
                    // Rename generic "Homework" titles to "Task X"
                    pkg.tasks.forEach(t => {
                      if (t.title === 'Homework' || t.title === 'Task') {
                        t.title = 'Task ' + taskCounter;
                      }
                      taskCounter++;
                    });
                  }
                } catch (err) {
                  warn(`[sparx] GetPackage ${pkg.packageId} failed: ${err.message}`);
                  pkg.tasks = [];
                }
                totalTasks += pkg.tasks.length;
                homeworkList.push(pkg);
              }

// ... (rest of the file remains the same) ...
