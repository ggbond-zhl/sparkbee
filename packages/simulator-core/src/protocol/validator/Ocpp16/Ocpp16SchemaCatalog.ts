import { defineSchemaCatalog } from "../internal/catalogBuilder";

import { ocpp16SchemaPairs } from "./schemaCatalogEntries";

export const ocpp16SchemaCatalog = defineSchemaCatalog(ocpp16SchemaPairs);

export type Ocpp16Action = keyof typeof ocpp16SchemaCatalog;
