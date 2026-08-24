import { PullRequestUseCase } from "../../application/usecases/pull_request_use_case";
export type PullRequestUseCaseDependencies = ConstructorParameters<typeof PullRequestUseCase>;
export declare function composePullRequestUseCase(...dependencies: PullRequestUseCaseDependencies): PullRequestUseCase;
