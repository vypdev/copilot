import { Buffer, isUtf8 } from 'node:buffer';
import type { BugbotBenchmarkCase } from '../../bugbot_benchmark';

type Mode = 'coil' | 'middleware' | 'unknown' | 'write' | 'bypass' | 'overwrite' | 'mock' | 'utf8';
const modes: readonly Mode[] = ['coil', 'middleware', 'unknown', 'write', 'bypass', 'overwrite', 'mock', 'utf8'];
const prefix = 'request-transform-';

function render(mode: Mode): string {
  if (mode === 'unknown') return [
    ' import { createLoader } from "unavailable-image-sdk";',
    '+const loader = createLoader({ diskCache: "disabled" });',
    ' // The resolved dependency request builder and execution evidence are unavailable.',
    ' await loader.load("https://fixture.invalid/image.png");',
  ].join('\n');
  if (mode === 'coil') return [
    ' val engine = MockEngine { request ->',
    '     assertTrue(request.headers[HttpHeaders.CacheControl]!!.contains("no-store"))',
    '     respond(validPng, headers = headersOf(HttpHeaders.ContentType, "image/png"))',
    ' }',
    ' val client = HttpClient(engine)',
    '+val loader = ImageLoader.Builder(context)',
    '+    .components { add(KtorNetworkFetcherFactory(client)) }',
    '+    .diskCachePolicy(CachePolicy.DISABLED)',
    '+    .build()',
    ' assertIs<SuccessResult>(loader.execute(ImageRequest.Builder(context).data(imageUrl).build()))',
  ].join('\n');
  const lines = [
    `${mode === 'write' ? '+' : ' '}const policy = { diskRead: false, diskWrite: ${mode === 'write'}, networkRead: true };`,
    ' function newRequest() {',
    '   const headers = {};',
    '   if (policy.networkRead && !policy.diskRead) {',
    '     headers["Cache-Control"] = policy.diskWrite ? "no-cache" : "no-cache, no-store";',
    '   }',
    '   return { headers };',
    ' }',
    ' function middleware() { return newRequest(); }',
    ' function applicationRequest() {',
    `${mode === 'bypass' || mode === 'mock' ? '+' : ' '}  const request = ${mode === 'bypass' || mode === 'mock' ? '{ headers: {} }' : 'middleware()'};`,
    `${mode === 'overwrite' ? '+' : ' '}  ${mode === 'overwrite' ? 'request.headers["Cache-Control"] = "no-cache";' : '// Preserve the upstream request headers.'}`,
    '   return request;',
    ' }',
    ' function transport(request) { return request.headers["Cache-Control"]; }',
    ' function testTransport(request) {',
    `   ${mode === 'mock' ? 'request.headers["Cache-Control"] = "no-cache, no-store";' : '// The test observes the request without adding headers.'}`,
    '   if (!String(transport(request)).includes("no-store")) throw new Error("no-store required");',
    ' }',
    ' const outgoing = applicationRequest();',
    `${mode === 'middleware' ? '+' : ' '}testTransport(outgoing);`,
  ];
  if (mode === 'utf8') lines.push(' const encoded = new TextEncoder().encode("é");',
    '+const preview = encoded.slice(0, 1);',
    ' new TextDecoder("utf-8", { fatal: true }).decode(preview);');
  return lines.join('\n');
}

const titles: Partial<Record<Mode, string>> = {
  write: 'Write-enabled policy does not provide the required no-store header',
  bypass: 'Raw request bypasses the header-producing middleware',
  overwrite: 'Downstream assignment removes the required no-store directive',
  mock: 'Header-injecting mock hides a missing production request header',
  utf8: 'Byte truncation splits a multibyte UTF-8 character',
};
const descriptions: Record<Mode, string> = {
  coil: 'Source-evidence fixture for Coil 3.6.3, not a new Coil execution. Valid unchanged desktop imports, context, imageUrl and PNG fixtures surround the diff. Official NetworkFetcher.newRequest maps enabled network reads plus disabled disk reads/writes to Cache-Control: no-cache, no-store before Ktor: https://github.com/coil-kt/coil/blob/3.6.3/coil-network-core/src/commonMain/kotlin/coil3/network/NetworkFetcher.kt . Matching Options defaults networkCachePolicy to ENABLED; CachePolicy.DISABLED has both flags false. MockEngine observes the outgoing request and supplies a response PNG, not request headers. Review the added factory configuration.',
  middleware: 'Controlled executable JavaScript-subset request pipeline. The unchanged library builder and middleware are supplied as context. The application contract requires no-store at the transport. The new test traverses those real authored functions; it does not inject request headers. This is a synthetic oracle, not execution of Coil or a consumer application.',
  unknown: 'No version-matched dependency source, resolved artifact contract or source-bound execution observation is available. The application requires no-store at the transport. Inspect only the supplied change; do not invent library semantics or an execution result.',
  write: 'Controlled executable request pipeline. Private image requests require no-store at the actual transport, not just no-cache. The unchanged versioned builder maps policy flags as shown. Review the changed policy; all shown functions are the actual authored fixture path.',
  bypass: 'Controlled executable request pipeline requiring no-store at the transport. The unchanged middleware invokes the header-producing builder. Review the changed application request construction and the downstream assertion.',
  overwrite: 'Controlled executable request pipeline requiring no-store at the transport. The unchanged upstream builder produces its policy-derived header. Review the added downstream assignment before the actual transport observes the request.',
  mock: 'Controlled executable request pipeline requiring no-store in production. The shown test mock mutates its input request before asserting. Production invokes applicationRequest followed by transport without testTransport. Review the changed production construction; a passing injecting mock is not production execution evidence.',
  utf8: 'Controlled executable request pipeline plus UTF-8 preview. The header builder and transport assertion are supplied. The preview contract requires valid UTF-8; its unchanged strict decoder rejects malformed bytes. Review the added byte truncation independently of request-header correctness.',
};

export const REQUEST_TRANSFORM_CASES: readonly BugbotBenchmarkCase[] = modes.map(mode => {
  const diff = render(mode);
  const file = mode === 'coil' ? 'media/PrivateLoader.kt' : 'media/request.ts';
  const added = diff.split('\n').findIndex(line => line.startsWith('+'));
  return { id: prefix + mode, language: mode === 'coil' ? 'kotlin' : 'typescript',
    category: titles[mode] ? 'correctness' : 'negative', description: descriptions[mode], file,
    startLine: 1, diff, expected: titles[mode] ? [{ id: prefix + mode, title: titles[mode]!,
      file, line: added + 1, severity: 'medium', category: 'correctness',
      codeSnippet: diff.split('\n')[added].slice(1).trim() }] : [] };
});

export function observeRequestTransform(item: { readonly id: string; readonly diff: string }) {
  const mode = modes.find(candidate => item.id === prefix + candidate);
  if (!mode || item.diff !== render(mode)) throw new Error('Unknown or modified request-transform fixture.');
  if (mode === 'unknown') return { kind: 'unavailable' as const };
  const policy = { diskRead: false, diskWrite: mode === 'write', networkRead: true };
  const headers: Array<string | undefined> = [];
  const mockHeaders: Array<string | undefined> = [];
  let producerCalls = 0;
  function newRequest() {
    producerCalls++;
    const request: { headers: Record<string, string> } = { headers: {} };
    if (policy.networkRead && !policy.diskRead) {
      request.headers['Cache-Control'] = policy.diskWrite ? 'no-cache' : 'no-cache, no-store';
    }
    return request;
  }
  function middleware() { return newRequest(); }
  function applicationRequest() {
    const request = mode === 'bypass' || mode === 'mock' ? { headers: {} as Record<string, string> } : middleware();
    if (mode === 'overwrite') request.headers['Cache-Control'] = 'no-cache';
    return request;
  }
  function transport(request: { headers: Record<string, string> }) { return request.headers['Cache-Control']; }
  function testTransport(request: { headers: Record<string, string> }) {
    if (mode === 'mock') request.headers['Cache-Control'] = 'no-cache, no-store';
    const value = transport(request);
    mockHeaders.push(value);
    if (!String(value).includes('no-store')) throw new Error('no-store required');
  }
  let testHeaderPasses = true;
  for (let session = 0; session < 3; session++) {
    const request = applicationRequest();
    headers.push(transport(request));
    const testRequest = { headers: { ...request.headers } };
    try { testTransport(testRequest); } catch { testHeaderPasses = false; }
  }
  return { kind: 'observed' as const, headers, mockHeaders, producerCalls,
    productionHeaderPasses: headers.every(value => String(value).includes('no-store')),
    testHeaderPasses,
    validUtf8: mode !== 'utf8' || isUtf8(Buffer.from('é', 'utf8').subarray(0, 1)) };
}
