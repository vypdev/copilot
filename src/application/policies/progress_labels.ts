export const PROGRESS_LABEL_PATTERN = /^\d+%$/;

export const PROGRESS_LABEL_PERCENTS = [
    0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
    55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
] as const;

export function progressPercentToColor(percent: number): string {
    const p = Math.min(100, Math.max(0, percent));
    let r: number, g: number, b: number;
    if (p <= 50) {
        const t = p / 50;
        r = Math.round(182 + (251 - 182) * t);
        g = Math.round(2 + (202 - 2) * t);
        b = Math.round(5 + (4 - 5) * t);
    } else {
        const t = (p - 50) / 50;
        r = Math.round(251 + (14 - 251) * t);
        g = Math.round(202 + (138 - 202) * t);
        b = Math.round(4 + (22 - 4) * t);
    }
    return [r, g, b].map(value => value.toString(16).padStart(2, '0')).join('');
}
