import { NativeMutationGuard } from './native_mutation_guard.ts';

/** The pause owner keeps its own instance, independent from session preference adoption. */
export class TemporaryPauseGuard extends NativeMutationGuard {}
