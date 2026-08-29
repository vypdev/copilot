import type { MainRunRoute as ApplicationMainRunRoute, MainRunRouteInput as ApplicationMainRunRouteInput } from '../application/ports/main_run_route_ports';
export type MainRunRoute = ApplicationMainRunRoute;
export type MainRunRouteInput = ApplicationMainRunRouteInput;
export declare function resolveMainRunRoute(input: MainRunRouteInput): MainRunRoute;
