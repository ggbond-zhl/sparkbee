import type { RequestOf, ResponseOf } from "../catalog";
import { ocpp16SchemaCatalog } from "./Ocpp16SchemaCatalog";

export { Ocpp16Validator } from "./Ocpp16Validator";
export {
  ocpp16SchemaCatalog,
  type Ocpp16Action,
} from "./Ocpp16SchemaCatalog";

type Ocpp16SchemaCatalog = typeof ocpp16SchemaCatalog;

export type Ocpp16RequestOf<TAction extends keyof Ocpp16SchemaCatalog> = RequestOf<
  Ocpp16SchemaCatalog,
  TAction
>;

export type Ocpp16ResponseOf<TAction extends keyof Ocpp16SchemaCatalog> = ResponseOf<
  Ocpp16SchemaCatalog,
  TAction
>;
