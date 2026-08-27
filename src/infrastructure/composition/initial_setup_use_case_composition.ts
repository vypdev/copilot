import { InitialSetupUseCase } from "../../application/usecases/actions/initial_setup_use_case";

export type InitialSetupUseCaseDependencies = ConstructorParameters<typeof InitialSetupUseCase>;

export function composeInitialSetupUseCase(...dependencies: InitialSetupUseCaseDependencies): InitialSetupUseCase {
    return new InitialSetupUseCase(...dependencies);
}
