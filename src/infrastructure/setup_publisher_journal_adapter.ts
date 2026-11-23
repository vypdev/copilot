import type { SetupPublisherOperation } from '../domain/setup_publisher_installation';
import { parseSetupPublisherOperation } from '../application/policies/setup_publisher_installation_policy';
import { SetupOperationJournalStore } from './setup_operation_journal_store';

/** Publisher-v2 facade over the same UUID namespace and exclusive lock as legacy batch. */
export class SetupPublisherJournalAdapter {
  private readonly store: SetupOperationJournalStore;
  constructor(root?: string) { this.store = new SetupOperationJournalStore(parseSetupPublisherOperation, root); }
  async load(id: string): Promise<SetupPublisherOperation | undefined> {
    const value = await this.store.load(id);
    return value === undefined ? undefined : parseSetupPublisherOperation(value);
  }
  async save(operation: SetupPublisherOperation): Promise<void> {
    const validated = parseSetupPublisherOperation(operation);
    return this.store.save(validated.operationId, validated);
  }
  lock(id: string): Promise<() => Promise<void>> { return this.store.lock(id); }
  async recordLocation(id: string): Promise<string | undefined> {
    try { return await this.store.location(id); }
    catch { return undefined; } // A missing navigation target never grants recovery or hides the main operation error.
  }
}
