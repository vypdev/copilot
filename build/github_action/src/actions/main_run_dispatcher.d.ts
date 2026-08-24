import type { Execution } from '../data/model/execution';
import type { Result } from '../data/model/result';
import type { ExecutableMainRunRoute, MainRunRouteHandlers } from './main_run_route_handlers';
export declare function dispatchMainRunRoute(route: ExecutableMainRunRoute, execution: Execution, handlers: MainRunRouteHandlers): Promise<Result[]>;
