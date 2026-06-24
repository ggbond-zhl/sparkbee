import { OcppJsonCodec } from "./OcppJsonCodec";

export class Ocpp201Codec extends OcppJsonCodec {
  protected readonly protocolVersion = "OCPP201";
}
