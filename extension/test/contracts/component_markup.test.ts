import { expect, it } from 'vitest';
import { componentScript } from '../../tooling/component_validation.mts';

const name = 'extension/src/presentation/View.svelte';
const script = '<script>let {value,items,kind}=$props();</script>';
const checked = '<script>import {centerLocationHash as link} from "../domain/center_routes.ts";let {items,kind}=$props();</script>';
it('renders inert untrusted strings and rejects raw HTML rather than trusting a rendered result', () => {
    expect(() => componentScript(name, `${script}<h1>{value}</h1><p>fetch is an inert word.</p>`)).not.toThrow();
    expect(() => componentScript(name, `${script}{@html value}`)).toThrow('presentation-markup-authority');
});
it('rejects native authority in expressions, callbacks, computed aliases and lazy markup before bundling', () => {
    for (const expression of ['window.location', 'document.cookie', 'globalThis["fetch"]', 'browser.storage', 'navigator.credentials', 'localStorage', 'new Function("return 1")']) {
        expect(() => componentScript(name, `<button onclick={()=>${expression}}>Read</button>`)).toThrow('presentation-markup-authority');
    }
    expect(() => componentScript(name, '<button onclick={()=>import("./View.svelte")}>Open</button>')).toThrow('presentation-dynamic-import');
});
it('rejects active elements and native document hooks rather than acquiring hidden DOM/browser authority', () => {
    for (const source of ['<iframe title="Remote"></iframe>', '<object title="Remote"></object>', '<embed title="Remote">',
        '<script>let {kind}=$props();</script><svelte:element this={kind} />', '<svelte:window />', '<svelte:document />', '<svelte:body />',
        '<svelte:head><base href="https://example.invalid"></svelte:head>', '<svelte:head><meta name="x" content="safe"></svelte:head>',
        '<svelte:head><link rel="stylesheet" href="https://example.invalid"></svelte:head>']) {
        expect(() => componentScript(name, source)).toThrow(/presentation-(?:active-element|markup-authority)/u);
    }
});
it('rejects spread attributes, DOM binding and arbitrary actions/attachments/transitions', () => {
    for (const source of [`${script}<button {...value}>Change</button>`, `${script}<div use:value>Content</div>`,
        `${script}<div {@attach value}>Content</div>`, `${script}<div transition:value>Content</div>`,
        '<script>let element=$state();</script><button bind:this={element}>Change</button>']) {
        expect(() => componentScript(name, source)).toThrow(/presentation-(?:markup-authority|dom-binding)/u);
    }
});
it('permits native unbound password entry but prevents the presentation state from binding or prepopulating it', () => {
    expect(() => componentScript(name, '<input type="password" aria-label="Session read credential" autocomplete="off">')).not.toThrow();
    expect(() => componentScript(name, `${script}<input type="password" aria-label="Credential" value={value}>`)).toThrow('presentation-secret-binding');
    expect(() => componentScript(name, '<script>let value=$state("");</script><input type="password" aria-label="Credential" bind:value>')).toThrow('presentation-secret-binding');
    expect(() => componentScript(name, `${script}<input type={kind} aria-label="Value">`)).toThrow('presentation-dynamic-input-type');
    expect(() => componentScript(name, '<script>let value=$state("");</script><input aria-label="Search" bind:value>')).not.toThrow();
});
it('accepts known local and fixed documentation links but never unchecked dynamic destinations', () => {
    for (const href of ['#/overview', '#/profiles/local', 'https://github.com/vypdev/copilot', 'https://docs.page/vypdev/copilot/browser-extension/runtime']) {
        expect(() => componentScript(name, `<a href="${href}">Open</a>`)).not.toThrow();
    }
    expect(() => componentScript(name, `${checked}<a href={link({route:'overview'})}>Overview</a>`)).not.toThrow();
    expect(() => componentScript(name, `${checked}<a href="{link({route:'overview'})}">Overview</a>`)).not.toThrow();
    for (const source of [`${script}<a href={value}>Open</a>`, '<a href="https://example.invalid">Open</a>',
        '<a href="#/unknown">Open</a>', '<a href="#/overview?secret=value">Open</a>',
        `${checked}<a href="{link({route:'overview'})}?private">Open</a>`]) expect(() => componentScript(name, source)).toThrow('presentation-unchecked-navigation');
});
it('does not confuse an identically named local function with the reviewed navigation policy', () => {
    for (const source of ['<script>const link=()=>"https://example.invalid";</script><a href={link()}>Open</a>',
        '<script>import {centerLocationHash as link} from "./foreign.ts";</script><a href={link()}>Open</a>',
        '<script>import {"centerLocationHash" as link} from "../domain/center_routes.ts";</script><a href={link()}>Open</a>',
        `${checked}{#each items as link}<a href={link()}>Open</a>{/each}`,
        `${checked}{#each items as {link}}<a href={link()}>Open</a>{/each}`,
        `${checked}{#each items as item, link}<a href={link()}>Open</a>{/each}`,
        `${checked}{#snippet row(link)}<a href={link()}>Open</a>{/snippet}`,
        `${checked}{#if items}{@const link=()=>"https://example.invalid"}<a href={link()}>Open</a>{/if}`,
        `${checked}{#await items then link}<a href={link()}>Open</a>{/await}`]) {
        expect(() => componentScript(name, source)).toThrow(/presentation-(?:unchecked-navigation|markup-authority)/u);
    }
});
it('does not admit hidden resource requests through inline styles, SVG href/paint or anchor telemetry', () => {
    for (const source of ['<div style="background:url(remote)">Settings</div>', `${script}<div style:background={value}>Settings</div>`,
        '<svg><use href="https://github.com/vypdev/copilot" /></svg>', '<svg><use HREF="https://github.com/vypdev/copilot" /></svg>', '<svg><path fill="url(https://example.invalid)" /></svg>',
        `${script}<svg><path fill={value} /></svg>`, '<a href="#/overview" ping="https://example.invalid">Open</a>',
        '<a href="#/overview" attributionsrc="https://example.invalid">Open</a>', '<table background="https://example.invalid"><tbody><tr><td>Settings</td></tr></tbody></table>']) {
        expect(() => componentScript(name, source)).toThrow(/presentation-|style-resource/u);
    }
    expect(() => componentScript(name, '<svg aria-hidden="true"><path fill="currentColor" d="M0 0h1v1H0z" /></svg>')).not.toThrow();
});
it('blocks implicit resource/submit attributes even when their operand is a local string', () => {
    for (const source of ['<img src="picture.png" alt="Control center layout">', '<img srcset="picture.png 2x" alt="Control center layout">',
        '<iframe title="Remote" srcdoc="<p>remote</p>"></iframe>', '<video poster="preview.png"><track kind="captions"></video>',
        '<form action="submit"><button>Submit</button></form>', '<button formaction="submit">Submit</button>',
        '<svg><a xlink:href="#view"><text>Open</text></a></svg>']) {
        expect(() => componentScript(name, source)).toThrow(/presentation-(?:resource-attribute|active-element)/u);
    }
});

it('accepts only the closed feature-reference builder from its exact domain module; arbitrary URLs and forged/shadowed builders stay rejected', () => {
    const safe = '<script>import {featureReferenceLink as reference} from "../domain/feature_links.ts";</script><a href={reference({kind:"milestone",id:"BEX-NAV-01"})}>Milestone</a>';
    expect(() => componentScript(name, safe)).not.toThrow();
    for (const source of [
        safe.replace('../domain/feature_links.ts', './foreign.ts'),
        safe.replace('featureReferenceLink as reference', 'other as reference'),
        '<script>import {featureReferenceLink as reference} from "../domain/feature_links.ts";let {items}=$props();</script>{#each items as reference}<a href={reference()}>Bad</a>{/each}',
        '<a href={`https://github.com/vypdev/copilot/issues/${id}`}>Bad</a>',
    ]) expect(() => componentScript(name, source)).toThrow(/presentation-(?:unchecked-navigation|markup-authority)/u);
});
