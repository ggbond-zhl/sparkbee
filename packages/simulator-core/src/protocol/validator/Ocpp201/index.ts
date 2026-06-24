import type { RequestOf, ResponseOf } from "../catalog";
import { ocpp201SchemaCatalog } from "./Ocpp201SchemaCatalog";

export { Ocpp201Validator } from "./Ocpp201Validator";
export {
  ocpp201SchemaCatalog,
  type Ocpp201Action,
} from "./Ocpp201SchemaCatalog";

type Ocpp201SchemaCatalog = typeof ocpp201SchemaCatalog;

export type Ocpp201RequestOf<TAction extends keyof Ocpp201SchemaCatalog> = RequestOf<
  Ocpp201SchemaCatalog,
  TAction
>;

export type Ocpp201ResponseOf<TAction extends keyof Ocpp201SchemaCatalog> = ResponseOf<
  Ocpp201SchemaCatalog,
  TAction
>;
