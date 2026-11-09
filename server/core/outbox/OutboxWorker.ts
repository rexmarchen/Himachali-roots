import { OutboxService } from './OutboxService.js';
import { EventBus } from './EventBus.js';

export class OutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly db: any;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;

  constructor(db: any, pollIntervalMs = 2500, batchSize = 25) {
    this.db = db;
    this.pollIntervalMs = pollIntervalMs;
    this.batchSize = batchSize;
  }

  /**
   * Process a single batch of pending outbox events (useful in tests and worker loops)
   * Returns the count of events successfully processed.
   */
  async processBatch(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let processedCount = 0;
    try {
      const pendingEvents = OutboxService.fetchPending(this.db, this.batchSize);

      for (const event of pendingEvents) {
        // Attempt to claim event
        const claimed = OutboxService.claim(this.db, event.id);
        if (!claimed) continue;

        try {
          await EventBus.getInstance().dispatch(event);
          OutboxService.markPublished(this.db, event.id);
          processedCount++;
        } catch (error) {
          OutboxService.markFailed(
            this.db,
            event.id,
            error instanceof Error ? error : String(error),
            event.retryCount,
            event.maxRetries,
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  /**
   * Start the continuous background polling loop
   */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.processBatch().catch(() => {
        // Swallow unhandled worker loop errors to prevent process exit
      });
    }, this.pollIntervalMs);
  }

  /**
   * Stop the background polling loop gracefully
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}

