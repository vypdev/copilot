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
export declare function buildSizeThresholds(values: SizeThresholdSet): SizeThresholds;
