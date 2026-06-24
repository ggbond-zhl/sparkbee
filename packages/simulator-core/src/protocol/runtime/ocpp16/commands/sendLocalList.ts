import type { InboundRequest } from "../../../session/types";
import type { Ocpp16RequestOf, Ocpp16ResponseOf } from "../../../validator/Ocpp16";
import type {
  AuthorizationStatus,
  LocalAuthorizationEntryInput,
} from "../../../../model";
import type { Ocpp16RuntimeContext } from "../state";
import type { Ocpp16AuthorizationStatus } from "../types";
import { parseOptionalDate } from "../responseParsers";
import {
  readPositiveIntegerConfig,
  supportsLocalAuthorizationList,
} from "./localAuthorizationListSupport";

type SendLocalListStatus = Ocpp16ResponseOf<"SendLocalList">["status"];

export async function handleSendLocalList(
  context: Ocpp16RuntimeContext,
  request: InboundRequest,
): Promise<void> {
  const payload = request.payload as Ocpp16RequestOf<"SendLocalList">;
  if (!supportsLocalAuthorizationList(context)) {
    await respond(request, "NotSupported");
    return;
  }

  if (payload.listVersion < 0) {
    await respond(request, "Failed");
    return;
  }

  const entries = payload.localAuthorizationList ?? [];
  const sendMaxLength = readPositiveIntegerConfig(
    context,
    "SendLocalListMaxLength",
  );
  if (sendMaxLength === null || entries.length > sendMaxLength) {
    await respond(request, "Failed");
    return;
  }

  if (payload.updateType === "Full") {
    if (entries.some((entry) => !hasIdTagInfo(entry))) {
      await respond(request, "Failed");
      return;
    }

    const nextEntries: LocalAuthorizationEntryInput[] = [];
    for (const entry of entries) {
      if (!hasIdTagInfo(entry)) {
        continue;
      }
      removeEntry(nextEntries, entry.idTag);
      nextEntries.push(toLocalAuthorizationEntry(entry));
    }
    const localMaxLength = readPositiveIntegerConfig(
      context,
      "LocalAuthListMaxLength",
    );
    if (localMaxLength === null || nextEntries.length > localMaxLength) {
      await respond(request, "Failed");
      return;
    }

    context.localAuthorizationList =
      context.localAuthorizationList.replaceEntries(
        payload.listVersion,
        context.clock(),
        "ocpp16",
        nextEntries,
      );
    await respond(request, "Accepted");
    return;
  }

  if (payload.listVersion <= context.localAuthorizationList.version) {
    await respond(request, "VersionMismatch");
    return;
  }

  const nextEntries: LocalAuthorizationEntryInput[] =
    context.localAuthorizationList.listAuthorizationEntries();
  for (const entry of entries) {
    if (!hasIdTagInfo(entry)) {
      removeEntry(nextEntries, entry.idTag);
      continue;
    }

    removeEntry(nextEntries, entry.idTag);
    nextEntries.push(toLocalAuthorizationEntry(entry));
  }

  const localMaxLength = readPositiveIntegerConfig(
    context,
    "LocalAuthListMaxLength",
  );
  if (localMaxLength === null || nextEntries.length > localMaxLength) {
    await respond(request, "Failed");
    return;
  }

  context.localAuthorizationList =
    context.localAuthorizationList.replaceEntries(
      payload.listVersion,
      context.clock(),
      "ocpp16",
      nextEntries,
    );
  await respond(request, "Accepted");
}

function respond(
  request: InboundRequest,
  status: SendLocalListStatus,
): Promise<void> {
  return request.respond({
    status,
  } satisfies Ocpp16ResponseOf<"SendLocalList">);
}

type SendLocalListEntry = NonNullable<
  Ocpp16RequestOf<"SendLocalList">["localAuthorizationList"]
>[number];
type SendLocalListEntryWithIdTagInfo =
  SendLocalListEntry & { idTagInfo: NonNullable<SendLocalListEntry["idTagInfo"]> };

function hasIdTagInfo(
  entry: SendLocalListEntry,
): entry is SendLocalListEntryWithIdTagInfo {
  return entry.idTagInfo !== undefined;
}

function toLocalAuthorizationEntry(
  entry: SendLocalListEntryWithIdTagInfo,
): LocalAuthorizationEntryInput {
  return {
    credentialId: entry.idTag,
    status: mapOcppAuthorizationStatus(entry.idTagInfo.status),
    validUntil: parseOptionalDate(entry.idTagInfo.expiryDate),
    groupCredentialId: entry.idTagInfo.parentIdTag ?? null,
  };
}

function removeEntry(
  entries: LocalAuthorizationEntryInput[],
  credentialId: string,
): void {
  const index = entries.findIndex((entry) =>
    typeof entry === "string"
      ? entry === credentialId
      : entry.credentialId === credentialId
  );
  if (index >= 0) {
    entries.splice(index, 1);
  }
}

function mapOcppAuthorizationStatus(
  status: Ocpp16AuthorizationStatus,
): AuthorizationStatus {
  switch (status) {
    case "Accepted":
      return "accepted";
    case "Blocked":
      return "blocked";
    case "Expired":
      return "expired";
    case "ConcurrentTx":
      return "concurrent-transaction";
    case "Invalid":
    default:
      return "invalid";
  }
}
