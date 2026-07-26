import pino from "pino";
import type { Logger } from "pino";

import { noopErrorReporter } from "../../config/errorReporter";
import type { ErrorReporter } from "../../config/errorReporter";
import type { ServerDatabase } from "../../db";
import { ChargingTransactionRepository } from "../chargingTransaction/chargingTransaction.repo";
import { TransactionDeliveryRepository } from "./transactionDelivery.repo";

const DAY_MS = 24 * 60 * 60 * 1_000;
const RETENTION_MS = 7 * DAY_MS;

export class TransactionDeliveryRetentionScheduler {
  private readonly deliveryRepository: TransactionDeliveryRepository;
  private readonly transactionRepository: ChargingTransactionRepository;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private readonly logger: Logger;
  private readonly errorReporter: ErrorReporter;

  constructor(
    database: ServerDatabase,
    private readonly options: {
      intervalMs?: number;
      batchSize?: number;
      now?: () => Date;
      logger?: Logger;
      errorReporter?: ErrorReporter;
    } = {},
  ) {
    this.deliveryRepository = new TransactionDeliveryRepository(database);
    this.transactionRepository = new ChargingTransactionRepository(database);
    this.logger = options.logger ?? pino({ level: "silent" });
    this.errorReporter = options.errorReporter ?? noopErrorReporter;
  }

  start(): void {
    this.stopped = false;
    void this.run();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  async cleanup(): Promise<{
    deliveries: number;
    samples: number;
    transactions: number;
  }> {
    const before = new Date(
      (this.options.now?.() ?? new Date()).getTime() - RETENTION_MS,
    );
    const batchSize = this.options.batchSize ?? 1_000;
    let deliveries = 0;
    while (true) {
      const deleted = await this.deliveryRepository.deleteTerminalBefore(
        before,
        batchSize,
      );
      deliveries += deleted;
      if (deleted < batchSize) break;
    }

    const transactions = { samples: 0, transactions: 0 };
    while (true) {
      const deleted = await this.transactionRepository.deleteExpired(
        before,
        batchSize,
      );
      transactions.samples += deleted.samples;
      transactions.transactions += deleted.transactions;
      if (deleted.samples < batchSize && deleted.transactions < batchSize) {
        return { deliveries, ...transactions };
      }
    }
  }

  private async run(): Promise<void> {
    try {
      await this.cleanup();
    } catch (error) {
      const context = { module: "transactionDeliveryRetention" };
      this.logger.error({
        event: "transaction-delivery.retention.failed",
        error,
      }, "Failed to remove expired transaction deliveries and transactions");
      this.errorReporter.captureException(error, context);
    }
    if (this.stopped) return;
    this.timer = setTimeout(
      () => void this.run(),
      this.options.intervalMs ?? DAY_MS,
    );
    this.timer.unref();
  }
}
