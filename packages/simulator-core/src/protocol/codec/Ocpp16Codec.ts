import { OcppJsonCodec } from "./OcppJsonCodec";

export class Ocpp16Codec extends OcppJsonCodec {
  protected readonly protocolVersion = "OCPP16J";
}
