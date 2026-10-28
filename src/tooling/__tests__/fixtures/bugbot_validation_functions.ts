/** Static authored functions. These functions, never corpus strings, are compiled and executed. */

export function registerCallerGuard(value: string, save: (email: string) => void): boolean {
  function valid(domain: string): boolean {
    const labels = domain.split('.');
    return labels.length >= 2 && labels.some(label => label.length > 0);
  }
  const parts = value.split('@');
  if (parts.length !== 2 || parts[0].length === 0 || /\s/.test(value)) return false;
  const domain = parts[1];
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  const checked = domain;
  if (!valid(checked)) return false;
  const stored = checked;
  save(value.slice(0, value.indexOf('@') + 1) + stored);
  return true;
}

export function registerNormalizedFirst(value: string, save: (email: string) => void): boolean {
  function valid(domain: string): boolean {
    const labels = domain.split('.');
    return labels.length >= 2 && labels.every(label => label.length > 0);
  }
  const parts = value.split('@');
  if (parts.length !== 2 || parts[0].length === 0 || /\s/.test(value)) return false;
  const domain = parts[1];
  const checked = domain.normalize('NFKC');
  if (/[@\s]/.test(checked)) return false;
  if (!valid(checked)) return false;
  const stored = checked;
  save(value.slice(0, value.indexOf('@') + 1) + stored);
  return true;
}

export function registerExistential(value: string, save: (email: string) => void): boolean {
  function valid(domain: string): boolean {
    const labels = domain.split('.');
    return labels.length >= 2 && labels.some(label => label.length > 0);
  }
  const parts = value.split('@');
  if (parts.length !== 2 || parts[0].length === 0 || /\s/.test(value)) return false;
  const domain = parts[1];
  const checked = domain;
  if (!valid(checked)) return false;
  const stored = checked;
  save(value.slice(0, value.indexOf('@') + 1) + stored);
  return true;
}

export function registerIgnoredResult(value: string, save: (email: string) => void): boolean {
  function valid(domain: string): boolean {
    const labels = domain.split('.');
    return labels.length >= 2 && labels.every(label => label.length > 0);
  }
  const parts = value.split('@');
  if (parts.length !== 2 || parts[0].length === 0 || /\s/.test(value)) return false;
  const domain = parts[1];
  const checked = domain;
  valid(checked);
  const stored = checked;
  save(value.slice(0, value.indexOf('@') + 1) + stored);
  return true;
}

export function registerNormalizedLate(value: string, save: (email: string) => void): boolean {
  function valid(domain: string): boolean {
    const labels = domain.split('.');
    return labels.length >= 2 && labels.every(label => label.length > 0);
  }
  const parts = value.split('@');
  if (parts.length !== 2 || parts[0].length === 0 || /\s/.test(value)) return false;
  const domain = parts[1];
  const checked = domain;
  if (!valid(checked)) return false;
  const stored = domain.normalize('NFKC');
  save(value.slice(0, value.indexOf('@') + 1) + stored);
  return true;
}
