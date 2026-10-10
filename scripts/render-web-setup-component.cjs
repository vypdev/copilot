const { resolve } = require('node:path');

/** Test-only semantic render of the configured Svelte/Vite component tree. */
async function main() {
  const [name, encodedProps, locale = 'en'] = process.argv.slice(2);
  if (!/^[A-Z][A-Za-z]+$/.test(name) || !encodedProps) {
    throw new Error('A named component and props are required.');
  }
  const { createServer } = await import('vite');
  const server = await createServer({
    configFile: resolve(__dirname, '../web/vite.config.mts'),
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent',
  });
  try {
    const catalog = await server.ssrLoadModule('/src/i18n/catalog.ts');
    if (!catalog.setupLocales.includes(locale)) throw new Error('Unsupported test locale.');
    const { setupLocale } = await server.ssrLoadModule('/src/i18n/localeStore.ts');
    setupLocale.set(locale);
    const component = await server.ssrLoadModule(`/src/components/${name}.svelte`);
    // Use the same Svelte SSR runtime as the Vite-transformed component.
    const { render } = await server.ssrLoadModule('svelte/server');
    const props = JSON.parse(encodedProps);
    for (const key of ['onSubmit', 'onRetryDiscovery', 'onClose', 'onAction', 'onPair']) props[key] = async () => undefined;
    process.stdout.write(render(component.default, { props }).body);
  } finally {
    await server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
