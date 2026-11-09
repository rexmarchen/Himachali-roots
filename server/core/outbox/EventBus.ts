import type { EventHandler, OutboxEvent } from './types.js';

export class EventBus {
  private static instance: EventBus;
  private readonly handlers = new Map<string, EventHandler[]>();

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Register a subscriber for a specific event type (e.g., 'order.placed', 'payment.captured')
   */
  subscribe<T = Record<string, unknown>>(eventType: string, handler: EventHandler<T>): void {
    const list = this.handlers.get(eventType) ?? [];
    list.push(handler as EventHandler);
    this.handlers.set(eventType, list);
  }

  /**
   * Dispatch an outbox event to all registered subscribers
   */
  async dispatch(event: OutboxEvent): Promise<void> {
    const list = this.handlers.get(event.eventType) ?? [];
    const wildcardList = this.handlers.get('*') ?? [];
    const all = [...list, ...wildcardList];

    if (all.length === 0) {
      // No handlers registered; event considered processed
      return;
    }

    for (const handler of all) {
      await handler(event);
    }
  }

  /**
   * List all registered event types
   */
  registeredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  clear(): void {
    this.handlers.clear();
  }
}

