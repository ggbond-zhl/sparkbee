import { eq } from "drizzle-orm";

import type { Database } from "../db";
import { transactions } from "../db/schema";
import type {
  CreateTransactionInput,
  EndTransactionInput,
  TransactionRepository
} from "./transaction.repository";

export class PostgresTransactionRepository implements TransactionRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateTransactionInput): Promise<void> {
    await this.db.insert(transactions).values({
      stationId: input.stationId,
      simulatorTransactionId: input.simulatorTransactionId,
      connectorId: input.connectorId,
      idTag: input.idTag,
      meterStartWh: input.meterStartWh,
      status: "active"
    });
  }

  async markEnded(input: EndTransactionInput): Promise<void> {
    await this.db
      .update(transactions)
      .set({
        meterStopWh: input.meterStopWh,
        status: "ended",
        stoppedAt: input.stoppedAt
      })
      .where(eq(transactions.simulatorTransactionId, input.simulatorTransactionId));
  }
}
