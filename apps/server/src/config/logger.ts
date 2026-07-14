import pino from "pino";
import type { DestinationStream, Level, Logger } from "pino";
import pretty from "pino-pretty";

const REDACTED_PATHS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "databaseUrl",
  "*.password",
  "*.token",
  "*.secret",
  "*.authorization",
  "*.cookie",
  "*.databaseUrl",
];

export interface CreateServerLoggerOptions {
  environment: string;
  level: Level;
  destination?: DestinationStream;
}

export function createServerLogger({
  environment,
  level,
  destination,
}: CreateServerLoggerOptions): Logger {
  const output = environment === "development"
    ? createPrettyDestination(destination)
    : destination;

  return pino(
    {
      level,
      redact: {
        paths: REDACTED_PATHS,
        censor: "[Redacted]",
      },
      serializers: {
        error: pino.stdSerializers.err,
      },
    },
    output,
  );
}

function createPrettyDestination(destination?: DestinationStream): DestinationStream {
  return pretty({
    colorize: destination === undefined && Boolean(process.stdout.isTTY),
    destination,
    singleLine: true,
    sync: true,
  });
}
