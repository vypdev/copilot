import { CheckCliUpdateUseCase } from '../../application/usecases/check_cli_update_use_case';
import { NpmCliUpdateCheckAdapter } from '../cli/npm_cli_update_check_adapter';

export function createCliUpdateCheckUseCase(): CheckCliUpdateUseCase {
    return new CheckCliUpdateUseCase(new NpmCliUpdateCheckAdapter());
}
