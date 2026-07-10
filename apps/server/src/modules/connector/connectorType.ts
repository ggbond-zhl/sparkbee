import {
  connectorTypeSchema,
  type ConnectorResponse,
} from "@spark-bee/contracts";

import { AppError } from "../../utils/errors";

export function toConnectorType(type: string): ConnectorResponse["type"] {
  if (type === "Type2") {
    return "IEC_62196_T2";
  }

  if (type === "CCS2") {
    return "IEC_62196_T2_COMBO";
  }

  const result = connectorTypeSchema.safeParse(type);
  if (!result.success) {
    throw new AppError(500, "INVALID_CONNECTOR_TYPE", "Invalid connector type");
  }

  return result.data;
}
