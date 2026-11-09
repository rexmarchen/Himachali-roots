export interface ApiMetricSample {
  path: string;
  method: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
}

export class MetricsRegistry {
  private static instance: MetricsRegistry;
  private totalRequests = 0;
  private statusCodes: Record<string, number> = {};
  private durations: number[] = [];
  private outboxProcessed = 0;
  private outboxDeadLetter = 0;

  static getInstance(): MetricsRegistry {
    if (!MetricsRegistry.instance) {
      MetricsRegistry.instance = new MetricsRegistry();
    }
    return MetricsRegistry.instance;
  }

  recordRequest(sample: ApiMetricSample): void {
    this.totalRequests++;
    const bucket = `${Math.floor(sample.statusCode / 100)}xx`;
    this.statusCodes[bucket] = (this.statusCodes[bucket] ?? 0) + 1;

    this.durations.push(sample.durationMs);
    // Keep sliding window of last 1000 samples to prevent memory leak
    if (this.durations.length > 1000) {
      this.durations.shift();
    }
  }

  recordOutboxSuccess(): void {
    this.outboxProcessed++;
  }

  recordOutboxDeadLetter(): void {
    this.outboxDeadLetter++;
  }

  getSnapshot(): {
    totalRequests: number;
    statusCodes: Record<string, number>;
    latency: { p50: number; p95: number; p99: number; count: number };
    outbox: { processed: number; deadLetter: number };
  } {
    const sorted = [...this.durations].sort((a, b) => a - b);
    const count = sorted.length;
    const p50 = count ? sorted[Math.floor(count * 0.5)] : 0;
    const p95 = count ? sorted[Math.floor(count * 0.95)] : 0;
    const p99 = count ? sorted[Math.floor(count * 0.99)] : 0;

    return {
      totalRequests: this.totalRequests,
      statusCodes: { ...this.statusCodes },
      latency: { p50, p95, p99, count },
      outbox: {
        processed: this.outboxProcessed,
        deadLetter: this.outboxDeadLetter,
      },
    };
  }
}

