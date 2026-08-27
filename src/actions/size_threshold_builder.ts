import { SizeThreshold } from '../data/model/size_threshold';
import { SizeThresholds } from '../data/model/size_thresholds';

export interface SizeThresholdValues {
    lines: number;
    files: number;
    commits: number;
}

export interface SizeThresholdSet {
    xxl: SizeThresholdValues;
    xl: SizeThresholdValues;
    l: SizeThresholdValues;
    m: SizeThresholdValues;
    s: SizeThresholdValues;
    xs: SizeThresholdValues;
}

export function buildSizeThresholds(values: SizeThresholdSet): SizeThresholds {
    return new SizeThresholds(
        new SizeThreshold(values.xxl.lines, values.xxl.files, values.xxl.commits),
        new SizeThreshold(values.xl.lines, values.xl.files, values.xl.commits),
        new SizeThreshold(values.l.lines, values.l.files, values.l.commits),
        new SizeThreshold(values.m.lines, values.m.files, values.m.commits),
        new SizeThreshold(values.s.lines, values.s.files, values.s.commits),
        new SizeThreshold(values.xs.lines, values.xs.files, values.xs.commits),
    );
}
