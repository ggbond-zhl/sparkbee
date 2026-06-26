import { defineSchemaCatalog } from "../internal/catalogBuilder";

import { ocpp201SchemaPairs } from "./schemaCatalogEntries";

export const ocpp201SchemaCatalog = defineSchemaCatalog(ocpp201SchemaPairs);

export type Ocpp201Action = keyof typeof ocpp201SchemaCatalog;
