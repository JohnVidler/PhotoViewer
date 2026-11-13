import { randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config";

// Creating the first (administrator) account needs this code, which is printed in the server log. It stops a
// stranger who finds a freshly deployed server from claiming it before its owner does.
const setupCode = config.setupCode || randomBytes(6).toString("hex");

export function getSetupCode(): string {
  return setupCode;
}

export function setupCodeMatches(candidate: unknown): boolean {
  if (typeof candidate !== "string") {
    return false;
  }

  const expected = Buffer.from(setupCode);
  const actual = Buffer.from(candidate.trim());
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
