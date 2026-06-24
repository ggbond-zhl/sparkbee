import { describe, expect, test } from "vitest";

import * as protocol from "../../../src/protocol/index.ts";
import { Ocpp16Codec } from "../../../src/protocol/codec/Ocpp16Codec.ts";
import { Ocpp201Codec } from "../../../src/protocol/codec/Ocpp201Codec.ts";
import { Ocpp16Validator } from "../../../src/protocol/validator/Ocpp16/Ocpp16Validator.ts";
import { Ocpp201Validator } from "../../../src/protocol/validator/Ocpp201/Ocpp201Validator.ts";
import { BootNotificationRequestSchema as Ocpp16BootNotificationRequestSchema } from "../../../src/protocol/validator/Ocpp16/schemas/BootNotificationRequest.ts";
import { BootNotificationRequestSchema as Ocpp201BootNotificationRequestSchema } from "../../../src/protocol/validator/Ocpp201/schemas/BootNotificationRequest.ts";

describe("protocol public API", () => {
  test("creates version-specific codecs", () => {
    expect(protocol.createCodec("OCPP16J")).toBeInstanceOf(Ocpp16Codec);
    expect(protocol.createCodec("OCPP201")).toBeInstanceOf(Ocpp201Codec);
  });

  test("creates version-specific validators", () => {
    expect(protocol.createValidator("OCPP16J")).toBeInstanceOf(Ocpp16Validator);
    expect(protocol.createValidator("OCPP201")).toBeInstanceOf(Ocpp201Validator);
  });

  test("re-exports the stable root protocol surface", () => {
    expect(protocol.ProtocolError).toBeDefined();
    expect(protocol.Ocpp16Validator).toBe(Ocpp16Validator);
    expect(protocol.Ocpp201Validator).toBe(Ocpp201Validator);
    expect(protocol.Ocpp16).toBeDefined();
    expect(protocol.Ocpp201).toBeDefined();
    expect(protocol.SchemaRegistryValidator).toBeDefined();
    expect(protocol.mapZodIssues).toBeDefined();
  });

  test("exposes structured validator namespaces instead of raw schema barrels", () => {
    expect(protocol.Ocpp16.ocpp16SchemaCatalog.BootNotification).toBeDefined();
    expect(protocol.Ocpp201.ocpp201SchemaCatalog.BootNotification).toBeDefined();
    expect("BootNotificationRequestSchema" in protocol.Ocpp16).toBe(false);
    expect("BootNotificationRequestSchema" in protocol.Ocpp201).toBe(false);
    expect(Ocpp16BootNotificationRequestSchema).toBeDefined();
    expect(Ocpp201BootNotificationRequestSchema).toBeDefined();
  });
});
