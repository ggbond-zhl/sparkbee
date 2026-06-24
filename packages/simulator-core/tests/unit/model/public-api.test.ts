import { describe, expect, test } from "vitest";

import * as model from "../../../src/model/index.ts";
import type {
  ConfigurationEntrySelector,
  Credential,
} from "../../../src/model/index.ts";

describe("model public API", () => {
  test("re-exports the stable model surface from the root barrel", () => {
    expect(model.Transaction).toBeDefined();
    expect(model.Connector).toBeDefined();
    expect(model.EVSE).toBeDefined();
    expect(model.ChargingPoint).toBeDefined();
    expect(model.AuthorizationGrant).toBeDefined();
    expect(model.LocalAuthorizationList).toBeDefined();
    expect(model.ConfigurationEntry).toBeDefined();
    expect(model.ConfigurationCatalog).toBeDefined();
    expect(model.ModelError).toBeDefined();
    expect(model.createChargingPointRef).toBeDefined();
    expect("AuthorizationListState" in model).toBe(false);
    expect("ChargingSession" in model).toBe(false);
    expect("normalizeChargingPointCapabilities" in model).toBe(false);
  });

  test("exposes model options separately", () => {
    const credential: Credential = {
      id: "cred-1",
      value: "abcd",
      type: "rfid",
    };
    const selector: ConfigurationEntrySelector = {
      key: "HeartbeatInterval",
    };

    expect(selector.key).toBe("HeartbeatInterval");
    expect(credential.id).toBe("cred-1");
  });
});
