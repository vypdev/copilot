import { SetupDoctorUseCase } from '../../application/usecases/setup/doctor_use_case';
import type { DoctorOutputPort } from '../../application/ports/setup_wizard_ports';
export declare function createSetupDoctorUseCase(output: DoctorOutputPort): SetupDoctorUseCase;
