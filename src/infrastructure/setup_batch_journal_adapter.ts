import type { SetupBatchOperation } from '../domain/setup_batch';
import type { SetupBatchJournalPort } from '../application/ports/setup_batch_ports';
import { parseSetupBatchOperation } from '../application/policies/setup_batch_policy';
import { SetupOperationJournalStore } from './setup_operation_journal_store';

/** Legacy schema-v1 facade: no migration or purpose inference. */
export class SetupBatchJournalAdapter implements SetupBatchJournalPort {
  private readonly store: SetupOperationJournalStore;
  constructor(root?: string) { this.store = new SetupOperationJournalStore(parseSetupBatchOperation, root); }
  async load(id: string): Promise<SetupBatchOperation | undefined> {
    const value = await this.store.load(id);
    return value === undefined ? undefined : parseSetupBatchOperation(value);
  }
  async save(operation: SetupBatchOperation): Promise<void> {
    const validated = parseSetupBatchOperation(operation);
    return this.store.save(validated.operationId, validated);
  }
  lock(id: string): Promise<() => Promise<void>> { return this.store.lock(id); }
}
