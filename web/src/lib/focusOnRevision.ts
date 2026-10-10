/** Move keyboard/screen-reader focus only when the decision itself changes. */
export function focusOnRevision(node: { readonly isConnected: boolean; focus(options?: { preventScroll?: boolean }): void }, initialRevision: number) {
  let revision = initialRevision;
  let active = true;
  const focus = () => queueMicrotask(() => { if (active && node.isConnected) node.focus({ preventScroll: true }); });
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
