// Fixed owned browser probe, not an evaluator of corpus or consumer source.
// Qualification supplies pinned Lit and an isolated real browser; production never imports this file.
import {LitElement, html} from 'lit';

class OwnedDraft extends LitElement {
  static properties = {phase: {}, draft: {state: true}};
  constructor() {
    super();
    this.phase = 'editing';
    this.draft = 'owned-draft';
    this.frames = [];
  }
  willUpdate(changed) {
    if (changed.has('phase') && this.phase === 'closed') this.draft = '';
  }
  render() {
    this.frames.push(this.phase);
    return this.phase === 'closed' ? html`<h1>Closed</h1>` : html`<input .value=${this.draft}>`;
  }
}
class DelayedDraft extends OwnedDraft {
  async scheduleUpdate() {
    // A supported custom scheduler: completion requires more than an unrelated resolved promise.
    await Promise.resolve();
    await Promise.resolve();
    super.scheduleUpdate();
  }
}
class OwnedParent extends LitElement {
  static properties = {phase: {}};
  constructor() { super(); this.phase = 'editing'; }
  render() { return html`<owned-848-delayed .phase=${this.phase}></owned-848-delayed>`; }
}
customElements.define('owned-848-draft', OwnedDraft);
customElements.define('owned-848-delayed', DelayedDraft);
customElements.define('owned-848-parent', OwnedParent);

async function prepare(delayed = false) {
  const element = document.createElement(delayed ? 'owned-848-delayed' : 'owned-848-draft');
  document.body.append(element);
  await element.updateComplete;
  return element;
}
async function closeAndWait(element) {
  element.phase = 'closed';
  await element.updateComplete;
}
async function finish(element) {
  await element.updateComplete;
  const result = {frames: [...element.frames], phase: element.phase, draft: element.draft,
    input: element.shadowRoot.querySelector('input')?.value ?? null};
  element.remove();
  return result;
}

export async function sameLine() {
  const element = await prepare();
  element.phase = 'closed'; await element.updateComplete;
  element.phase = 'editing'; await element.updateComplete;
  return finish(element);
}
export async function expandedLines() {
  const element = await prepare();
  element.phase = 'closed';
  await element.updateComplete;
  element.phase = 'editing';
  await element.updateComplete;
  return finish(element);
}
export async function receiverAlias() {
  const element = await prepare();
  const current = element;
  current.phase = 'closed'; await current.updateComplete;
  element.phase = 'editing'; await element.updateComplete;
  return finish(element);
}
export async function awaitedHelper() {
  const element = await prepare();
  await closeAndWait(element);
  element.phase = 'editing'; await element.updateComplete;
  return finish(element);
}
export async function synchronousUpdate() {
  const element = await prepare();
  element.phase = 'closed'; element.performUpdate();
  element.phase = 'editing'; await element.updateComplete;
  return finish(element);
}
export async function animationFrame() {
  const element = await prepare();
  element.phase = 'closed'; await new Promise(resolve => requestAnimationFrame(resolve));
  element.phase = 'editing'; await element.updateComplete;
  return finish(element);
}
export async function missingBoundary() {
  const element = await prepare();
  element.phase = 'closed';
  element.phase = 'editing'; await element.updateComplete;
  return finish(element);
}
export async function wrongReceiver() {
  const element = await prepare(true), other = await prepare();
  element.phase = 'closed'; await other.updateComplete;
  element.phase = 'editing'; await element.updateComplete;
  other.remove();
  return finish(element);
}
export async function stalePromise() {
  const element = await prepare(true), previous = element.updateComplete;
  element.phase = 'closed'; await previous;
  element.phase = 'editing'; await element.updateComplete;
  return finish(element);
}
export async function unawaitedHelper() {
  const element = await prepare();
  const pending = closeAndWait(element);
  element.phase = 'editing'; await pending;
  return finish(element);
}
export async function unawaitedThen() {
  const element = await prepare();
  element.phase = 'closed'; element.updateComplete.then(() => undefined);
  element.phase = 'editing'; await element.updateComplete;
  return finish(element);
}
export async function parentBeforeChild() {
  const parent = document.createElement('owned-848-parent');
  document.body.append(parent); await parent.updateComplete;
  const element = parent.shadowRoot.querySelector('owned-848-delayed');
  await element.updateComplete;
  parent.phase = 'closed'; await parent.updateComplete;
  parent.phase = 'editing'; await parent.updateComplete; await element.updateComplete;
  const result = await finish(element);
  parent.remove();
  return result;
}

export async function runProbe() {
  const cases = {sameLine, expandedLines, receiverAlias, awaitedHelper, synchronousUpdate, animationFrame,
    missingBoundary, wrongReceiver, stalePromise, unawaitedHelper, unawaitedThen, parentBeforeChild};
  const observations = [];
  for (const [id, run] of Object.entries(cases)) observations.push({id, ...await run()});
  return observations;
}
