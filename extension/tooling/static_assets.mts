export const RUNTIME_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Copilot runtime settings</title>
<style>body{font:1rem system-ui;max-width:48rem;margin:2rem auto;padding:0 1rem;color-scheme:light dark}label,input,button{display:block;margin:1rem 0}input{box-sizing:border-box;width:100%;padding:.6rem}button{padding:.7rem}p{overflow-wrap:anywhere}:focus-visible{outline:3px solid #0969da;outline-offset:3px}</style>
</head><body><main><h1 id="title">Copilot runtime</h1><p id="scope"></p>
<p id="status" role="status" aria-live="polite">Checking connection…</p>
<form id="connection"><label id="repository-label" for="repository">Selected repository (owner/name)</label>
<input id="repository" name="repository" required maxlength="201" autocomplete="off" spellcheck="false">
<label id="credential-label" for="credential">Session read credential</label>
<input id="credential" name="credential" type="password" required maxlength="255" autocomplete="off" spellcheck="false">
<button id="connect" type="submit">Connect read access for this session</button></form>
<button id="disconnect" type="button">Disconnect this session</button><p id="privacy"></p>
<details><summary id="details-title">Technical details</summary><code id="build-identity"></code></details>
</main><script src="runtime.js"></script></body></html>
`;
