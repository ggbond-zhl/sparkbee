import type { ConfigurationEntry } from "../../../../model";
import type { InboundRequest } from "../../../session/types";
import type { Ocpp16RequestOf, Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import type { Ocpp16RuntimeContext } from "../state";

type GetConfigurationResponse = Ocpp16ResponseOf<"GetConfiguration">;
type ConfigurationKeyResponse =
  NonNullable<GetConfigurationResponse["configurationKey"]>[number];

export async function handleGetConfiguration(
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
): Promise<void> {
  const payload = request.payload as Ocpp16RequestOf<"GetConfiguration">;
  const requestedKeys = payload.key;

  if (requestedKeys === undefined || requestedKeys.length === 0) {
    await request.respond({
      configurationKey: context.configurationStore
        .listEntries()
        .map(toConfigurationKeyResponse),
    } satisfies GetConfigurationResponse);
    return;
  }

  const maxKeys = getMaxRequestedKeys(context);
  if (requestedKeys.length > maxKeys) {
    await request.reject(
      "OccurrenceConstraintViolation",
      "GetConfiguration.req key 数量超过 GetConfigurationMaxKeys",
      {
        requestedKeys: requestedKeys.length,
        maxKeys,
      },
    );
    return;
  }

  const configurationKey: ConfigurationKeyResponse[] = [];
  const unknownKey: string[] = [];
  const seenKeys = new Set<string>();
  for (const key of requestedKeys) {
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);

    const entry = context.configurationStore.getEntry(key);
    if (entry === undefined) {
      unknownKey.push(key);
      continue;
    }

    configurationKey.push(toConfigurationKeyResponse(entry));
  }

  const response: GetConfigurationResponse = {};
  if (configurationKey.length > 0) {
    response.configurationKey = configurationKey;
  }
  if (unknownKey.length > 0) {
    response.unknownKey = unknownKey;
  }

  await request.respond(response);
}

function toConfigurationKeyResponse(
  entry: ConfigurationEntry,
): ConfigurationKeyResponse {
  return {
    key: entry.key,
    readonly: entry.isReadonly,
    value: entry.value,
  };
}

function getMaxRequestedKeys(context: Ocpp16RuntimeContext): number {
  return context.configurationFacts.getConfigurationMaxKeys();
}
