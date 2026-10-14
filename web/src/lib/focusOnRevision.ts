/** Move keyboard/screen-reader focus only when the decision itself changes. */
interface FocusTarget { readonly isConnected: boolean; focus(options?: { preventScroll?: boolean }): void }
interface DecisionHeading extends FocusTarget { setAttribute(name: string, value: string): void }
export function focusOnRevision(node: FocusTarget & { querySelector?(selector: string): DecisionHeading | null }, initialRevision: number) {
  let revision = initialRevision;
  let active = true;
  const focus = () => queueMicrotask(() => {
    if (!active || !node.isConnected) return;
    const heading = node.querySelector?.('h2');
    if (heading?.isConnected) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: false }); }
    else node.focus({ preventScroll: false });
  });
  focus();
  return {
    update(nextRevision: number) {
      if (nextRevision === revision) return;
      revision = nextRevision;
      focus();
    },
    destroy() { active = false; },
  };
}
