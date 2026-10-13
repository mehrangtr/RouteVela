import { basename } from 'node:path';

// Public CI annotations contain only known test stages, stable codes and scalar
// assertions. Raw exceptions, paths, configs, payload strings and tokens stay out.
export function failureAnnotation(data) {
  const file = basename(data.file ?? '').replaceAll('\\', '/').split('/').at(-1);
  const location = /^[a-z-]+(?:\.test)?\.mjs$/.test(file ?? '') ? file : 'test';
  const fields = [`file=${location}`];
  if (Number.isSafeInteger(data.line) && data.line > 0) fields.push(`line=${data.line}`);
  if (/^real core VLESS\/WSS connection: [a-z ]+$/.test(data.name ?? '') ||
    data.name === 'official pinned core parses the unchanged renderer output') fields.push(`case=${data.name}`);
  let error = data.details?.error;
  for (let depth = 0; error && depth < 3; depth++, error = error.cause) {
    if (/^ERR_[A-Z_0-9]+$/.test(error.code ?? '')) fields.push(`code=${error.code}`);
    if (/^CORE_[A-Z_]+(?::[A-Za-z0-9_.-]+)*$/.test(error.message ?? '')) fields.push(`stage=${error.message}`);
    for (const name of ['expected', 'actual']) {
      const value = error[name];
      if (typeof value === 'boolean' || (Number.isSafeInteger(value) && Math.abs(value) <= 1e9)) fields.push(`${name}=${value}`);
    }
  }
  return `::error title=RouteVela test failure::${fields.join('; ')}\n`;
}

export default async function* diagnostics(source) {
  for await (const event of source) if (event.type === 'test:fail') yield failureAnnotation(event.data);
}
