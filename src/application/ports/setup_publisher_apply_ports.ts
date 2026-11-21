import type { SetupPublisherOperation, SetupPublisherPlan } from '../../domain/setup_publisher_installation';
import type { SetupInstallationObjectObserver, SetupInstallationDeliveryCoordinator } from './setup_installation_delivery_ports';

export interface SetupPublisherJournalPort {
  load(operationId: string): Promise<SetupPublisherOperation | undefined>;
  save(operation: SetupPublisherOperation): Promise<void>;
  lock(operationId: string): Promise<() => Promise<void>>;
}
export interface SetupPublisherFileDelivery {
  prepareCommit(observe: SetupInstallationObjectObserver, preparedTree?: string): Promise<string>;
  branch(commit: string, inspectOnly: boolean): Promise<void>;
  pullRequest(commit: string, inspectOnly: boolean): Promise<number>;
}
/** Resolves the private session paired with the reviewed facts. No resource writers. */
export interface SetupPublisherApplyPorts {
  readonly coordinator: SetupInstallationDeliveryCoordinator;
  readonly journal: SetupPublisherJournalPort;
  active(): boolean;
  delivery(plan: SetupPublisherPlan, session: object, revalidate: () => Promise<boolean>): SetupPublisherFileDelivery;
}
