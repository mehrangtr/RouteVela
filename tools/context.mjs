import { project, validateProject, contextPack } from './project.mjs';
try {
  const data = project();
  const errors = validateProject(data);
  if (errors.length) throw new Error(errors.join(','));
  console.log(JSON.stringify(contextPack(data), null, 2));
} catch (error) { console.error(`CONTEXT_ERROR:${error.message}`); process.exitCode = 1; }
