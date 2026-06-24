export interface CreateTransactionInput {
  stationId: string;
  simulatorTransactionId: string;
  connectorId: number;
  idTag: string;
  meterStartWh: number;
}

export interface EndTransactionInput {
  simulatorTransactionId: string;
  meterStopWh: number;
  stoppedAt: Date;
}

export interface TransactionRepository {
  create(input: CreateTransactionInput): Promise<void>;
  markEnded(input: EndTransactionInput): Promise<void>;
}
