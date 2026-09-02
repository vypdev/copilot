/** Adds or removes one activity label without touching unrelated labels. */
export function replaceAgentActivityLabel(
    currentLabels: readonly string[],
    activityLabel: string,
    active: boolean,
): string[] {
    const normalizedActivityLabel = activityLabel.trim().toLowerCase();
    if (!normalizedActivityLabel) return [...currentLabels];

    const retained = currentLabels.filter(label => label.trim().toLowerCase() !== normalizedActivityLabel);
    return active ? [...retained, activityLabel] : retained;
}
