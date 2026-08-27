import type { Execution } from '../data/model/execution';
import type { Result } from '../data/model/result';
import type { MainRunRoute } from './main_run_route';

export type ExecutableMainRunRoute = Exclude<MainRunRoute, 'unhandled'>;
export type MainRunRouteHandler = (execution: Execution) => Promise<Result[]>;
export type MainRunRouteHandlers = Record<ExecutableMainRunRoute, MainRunRouteHandler>;
