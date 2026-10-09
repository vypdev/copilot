export function manualProducerIdentity(
  rawName: string,
  rawAppId: string | number | undefined,
  rawWorkflow: string,
): string | undefined {
  const name = rawName.trim();
  const workflow = rawWorkflow.trim();
  const appId = String(rawAppId ?? '').trim();
  const numericId = Number(appId);
  if (!name || !workflow || name.length > 100 || workflow.length > 100
    || /[|;,\r\n]/u.test(name + workflow)
    || !/^[1-9]\d*$/u.test(appId) || !Number.isSafeInteger(numericId)) return undefined;
  return `${name}|${numericId}|${workflow}`;
}
