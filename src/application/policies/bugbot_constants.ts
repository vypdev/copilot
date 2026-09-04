/** Hidden marker prefix used to reconcile Bugbot findings across comments. */
export const BUGBOT_MARKER_PREFIX = 'copilot-bugbot';

/** Maximum number of individual Bugbot comments published for one analysis. */
export const BUGBOT_MAX_COMMENTS = 20;

/** Minimum severity published by default. */
export const BUGBOT_MIN_SEVERITY: 'info' | 'low' | 'medium' | 'high' = 'low';
