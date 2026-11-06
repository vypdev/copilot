/** Fixed read-only inspections, plus an explicitly isolated nonsecret native-provider probe. */
export const CENTER_SETTINGS_PROBE_KEY = 'copilot.settings.v1';
export const CENTER_BROWSER_SCRIPTS = Object.freeze({
    ready: 'return document.querySelector("main")?.getAttribute("aria-busy") === "false";',
    metadata: `const api=globalThis.browser??globalThis.chrome;return {
        manifest:api.runtime.getManifest(),root:api.runtime.getURL(""),id:api.runtime.id,
        source:document.documentElement.dataset.copilotSourceTree,locale:document.querySelector(".center")?.getAttribute("lang")};`,
    editor: 'return document.querySelector("main > .toolbar [role=status]")?.textContent === arguments[0];',
    route: `return {heading:document.querySelector("main > h1")?.textContent,
        source:document.documentElement.dataset.copilotSourceTree,active:document.querySelector("nav [aria-current=page]")?.getAttribute("href")};`,
    routeReady: `return !document.querySelector("main > p[role=alert]")
        && ![...document.querySelectorAll("main > p[role=status]")].some(node=>node.textContent===arguments[0])
        && document.querySelector("main > h1")?.textContent===arguments[1]
        && document.querySelector("nav [aria-current=page]")?.getAttribute("href")===arguments[2];`,
    appearance: 'return !!document.querySelector("#center-theme") && !document.querySelector("#center-theme").matches(":disabled");',
    review: 'return document.querySelector("section[aria-labelledby=settings-review-heading] [role=status]")?.textContent === arguments[0];',
    timeOrigin: 'return performance.timeOrigin;',
    theme: 'return document.querySelector("#center-theme")?.value;',
    sessions: 'return document.querySelector("section[aria-labelledby=connections-heading] > p[role=status]")?.textContent === arguments[0];',
    emptySessions: 'return document.querySelector("section[aria-labelledby=connections-heading]")?.textContent.includes(arguments[0]) === true;',
    snapshot: `const done=arguments[arguments.length-1],key=arguments[0],defaults=arguments[1];
        (globalThis.browser??globalThis.chrome).storage.local.get(key).then(values=>{
            const raw=values[key],settings=raw?.current??raw??defaults;
            done({envelope:JSON.stringify(raw??null),theme:settings.theme,revision:settings.revision});
        }).catch(()=>done(null));`,
    background: `const done=arguments[arguments.length-1];
        (globalThis.browser??globalThis.chrome).runtime.sendMessage({version:1,method:"settings.read"})
        .then(value=>done({source:value?.sourceTree,state:value?.state}),()=>done(null));`,
    providers: `const done=arguments[arguments.length-1],key=arguments[0],marker=arguments[1];
        (async()=>{const api=globalThis.browser??globalThis.chrome,result={local:false,session:false,clean:true};
            for(const name of ["local","session"]){const area=api.storage[name];let owned=false;
                try{const initial=await area.get(key);if(Object.hasOwn(initial,key))continue;
                    owned=true;await area.set({[key]:marker});result[name]=(await area.get(key))[key]===marker;
                }catch{}finally{if(owned){try{await area.remove(key);
                    if(Object.hasOwn(await area.get(key),key))result.clean=false;}catch{result.clean=false;}}}
            }done(result);
        })();`,
});
