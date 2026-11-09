export type OutboxStatus = 'pending' | 'processing' | 'published' | 'failed' | 'dead_letter';

export interface OutboxEvent<T = Record<string, unknown>> {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: T;
  status: OutboxStatus;
  retryCount: number;
  maxRetries: number;
  lastError?: string | null;
  scheduledAt: string;
  processedAt?: string | null;
  createdAt: string;
}

export interface EnqueueEventInput<T = Record<string, unknown>> {
  id?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: T;
  maxRetries?: number;
  delayMs?: number;
}

export type EventHandler<T = Record<string, unknown>> = (event: OutboxEvent<T>) => Promise<void> | void;

