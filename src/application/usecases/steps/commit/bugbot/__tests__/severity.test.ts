/**
 * Unit tests for bugbot severity helpers: normalizeMinSeverity, severityLevel, meetsMinSeverity.
 */

import { normalizeMinSeverity, severityLevel, meetsMinSeverity } from '../severity';

describe('normalizeMinSeverity', () => {
    it('returns "low" when value is undefined', () => {
        expect(normalizeMinSeverity(undefined)).toBe('low');
    });

    it('returns "low" when value is empty string', () => {
        expect(normalizeMinSeverity('')).toBe('low');
    });

    it('returns the level when value is valid (case-insensitive)', () => {
        expect(normalizeMinSeverity('info')).toBe('info');
        expect(normalizeMinSeverity('INFO')).toBe('info');
        expect(normalizeMinSeverity('low')).toBe('low');
        expect(normalizeMinSeverity('Low')).toBe('low');
        expect(normalizeMinSeverity('medium')).toBe('medium');
        expect(normalizeMinSeverity('MEDIUM')).toBe('medium');
        expect(normalizeMinSeverity('high')).toBe('high');
        expect(normalizeMinSeverity('High')).toBe('high');
    });

    it('trims whitespace', () => {
        expect(normalizeMinSeverity('  medium  ')).toBe('medium');
    });

    it('returns "low" when value is invalid', () => {
        expect(normalizeMinSeverity('critical')).toBe('low');
        expect(normalizeMinSeverity('unknown')).toBe('low');
        expect(normalizeMinSeverity('1')).toBe('low');
    });
});

describe('severityLevel', () => {
    it('returns numeric order for valid severities', () => {
        expect(severityLevel('info')).toBe(0);
        expect(severityLevel('low')).toBe(1);
        expect(severityLevel('medium')).toBe(2);
        expect(severityLevel('high')).toBe(3);
    });

    it('returns low (1) when severity is undefined or empty', () => {
        expect(severityLevel(undefined)).toBe(1);
        expect(severityLevel('')).toBe(1);
    });

    it('returns low for unknown severity', () => {
        expect(severityLevel('critical')).toBe(1);
    });

    it('is case-insensitive', () => {
        expect(severityLevel('HIGH')).toBe(3);
        expect(severityLevel('  Medium  ')).toBe(2);
    });
});

describe('meetsMinSeverity', () => {
    it('returns true when finding severity equals min', () => {
        expect(meetsMinSeverity('low', 'low')).toBe(true);
        expect(meetsMinSeverity('medium', 'medium')).toBe(true);
        expect(meetsMinSeverity('high', 'high')).toBe(true);
    });

    it('returns true when finding severity is above min', () => {
        expect(meetsMinSeverity('high', 'low')).toBe(true);
        expect(meetsMinSeverity('high', 'medium')).toBe(true);
        expect(meetsMinSeverity('medium', 'low')).toBe(true);
        expect(meetsMinSeverity('medium', 'info')).toBe(true);
    });

    it('returns false when finding severity is below min', () => {
        expect(meetsMinSeverity('info', 'low')).toBe(false);
        expect(meetsMinSeverity('low', 'medium')).toBe(false);
        expect(meetsMinSeverity('medium', 'high')).toBe(false);
    });

    it('treats undefined finding severity as low', () => {
        expect(meetsMinSeverity(undefined, 'info')).toBe(true); // low >= info
        expect(meetsMinSeverity(undefined, 'low')).toBe(true);
        expect(meetsMinSeverity(undefined, 'medium')).toBe(false);
    });

    it('handles case-insensitive finding severity', () => {
        expect(meetsMinSeverity('HIGH', 'medium')).toBe(true);
        expect(meetsMinSeverity('Low', 'medium')).toBe(false);
    });
});
