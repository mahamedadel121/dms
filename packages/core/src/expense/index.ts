import { DomainError } from '../errors';

// TODO(WP2): expense module hooks registered through engine.registerModule.
export function registerExpenseModule(): void {
  throw new DomainError('NOT_IMPLEMENTED', 'registerExpenseModule is not implemented yet (WP2)');
}
