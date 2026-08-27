import { IssueUseCase } from "../../application/usecases/issue_use_case";
export type IssueUseCaseDependencies = ConstructorParameters<typeof IssueUseCase>;
export declare function composeIssueUseCase(...dependencies: IssueUseCaseDependencies): IssueUseCase;
