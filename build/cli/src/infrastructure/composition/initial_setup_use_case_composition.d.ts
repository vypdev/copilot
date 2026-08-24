import { InitialSetupUseCase } from "../../application/usecases/actions/initial_setup_use_case";
export type InitialSetupUseCaseDependencies = ConstructorParameters<typeof InitialSetupUseCase>;
export declare function composeInitialSetupUseCase(...dependencies: InitialSetupUseCaseDependencies): InitialSetupUseCase;
