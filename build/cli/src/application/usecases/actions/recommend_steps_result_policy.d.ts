import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { RecommendationState } from '../../../data/model/recommendation_state';
export declare function buildRecommendationResult(param: Execution, taskId: string, response: string | Record<string, unknown> | undefined, issueDescriptionFingerprint: string, previousRecommendation: RecommendationState | undefined, issueNumber: number): Result[];
