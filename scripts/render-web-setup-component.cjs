const { resolve } = require('node:path');

/** Test-only semantic render of the configured Svelte/Vite component tree. */
async function createRenderer() {
  const { createServer } = await import('vite');
  const server = await createServer({
    configFile: resolve(__dirname, '../web/vite.config.mts'),
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent',
  });
  try {
    const catalog = await server.ssrLoadModule('/src/i18n/catalog.ts');
    const { setupLocale } = await server.ssrLoadModule('/src/i18n/localeStore.ts');
    const { render } = await server.ssrLoadModule('svelte/server');
    return {
      async render(name, encodedProps, locale = 'en') {
        if (!/^[A-Z][A-Za-z]+$/.test(name) || !encodedProps) throw new Error('A named component and props are required.');
        if (!catalog.setupLocales.includes(locale)) throw new Error('Unsupported test locale.');
        setupLocale.set(locale);
        const component = await server.ssrLoadModule(`/src/components/${name}.svelte`);
        const props = JSON.parse(encodedProps);
        for (const key of ['onSubmit', 'onRetryDiscovery', 'onClose', 'onAction', 'onPair']) props[key] = async () => undefined;
        return render(component.default, { props }).body;
      },
      close: () => server.close(),
    };
  } catch (error) {
    await server.close();
    throw error;
  }
}

async function main() {
  const renderer = await createRenderer();
  if (process.argv[2] !== '--ipc') {
    try { process.stdout.write(await renderer.render(...process.argv.slice(2))); }
    finally { await renderer.close(); }
    return;
  }
  if (!process.send) { await renderer.close(); throw new Error('An IPC channel is required.'); }
  // Each request has its own locale/props and shares only the real compiler graph.
  let queue = Promise.resolve();
  process.on('message', request => {
    queue = queue.then(async () => {
      if (request?.type === 'close') { await renderer.close(); process.disconnect(); return; }
      if (request?.type !== 'render' || !Number.isSafeInteger(request.id) || request.id < 1) return;
      try {
        const html = await renderer.render(request.name, request.props, request.locale);
        process.send({ type: 'rendered', id: request.id, html });
      } catch (error) {
        process.send({ type: 'failed', id: request.id, message: error instanceof Error ? error.message : 'Component render failed.' });
      }
    }).catch(async error => {
      console.error(error);
      process.exitCode = 1;
      await renderer.close();
      if (process.connected) process.disconnect();
    });
  });
  process.send({ type: 'ready' });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
