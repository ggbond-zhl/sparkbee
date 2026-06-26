import { AppError } from "../../utils/errors";

export function normalizeCentralSystemUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError(400, "VALIDATION_FAILED", "Validation failed", [
      {
        path: ["centralSystemUrl"],
        message: "Central system URL must be a valid URL",
      },
    ]);
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new AppError(400, "VALIDATION_FAILED", "Validation failed", [
      {
        path: ["centralSystemUrl"],
        message: "Central system URL must use ws or wss",
      },
    ]);
  }

  if (url.search !== "" || url.hash !== "") {
    throw new AppError(400, "VALIDATION_FAILED", "Validation failed", [
      {
        path: ["centralSystemUrl"],
        message: "Central system URL must not include query or hash",
      },
    ]);
  }

  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString().replace(/\/$/u, "");
}
