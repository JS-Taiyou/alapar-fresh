/**
 * Tests for the pure decision functions exported from `lib/realtime.ts`.
 *
 * The full async recovery loop touches `fetch`, WebSocket internals, and
 * Supabase client state — those are integration-test territory. Here we lock
 * down the recovery *policy*: which statuses trigger recovery, how many
 * attempts, and the backoff schedule.
 */
import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  MAX_RECOVERY_ATTEMPTS,
  RECOVERABLE_STATUSES,
  RECOVERY_BACKOFF_MS,
  shouldRecover,
} from "./realtime.ts";

describe("shouldRecover", () => {
  it("returns true for CHANNEL_ERROR", () => {
    assertEquals(shouldRecover("CHANNEL_ERROR"), true);
  });

  it("returns true for TIMED_OUT", () => {
    assertEquals(shouldRecover("TIMED_OUT"), true);
  });

  it("returns true for CLOSED", () => {
    assertEquals(shouldRecover("CLOSED"), true);
  });

  it("returns false for SUBSCRIBED (healthy state)", () => {
    assertEquals(shouldRecover("SUBSCRIBED"), false);
  });

  it("returns false for unknown statuses", () => {
    assertEquals(shouldRecover("UNKNOWN"), false);
    assertEquals(shouldRecover(""), false);
  });

  it("RECOVERABLE_STATUSES matches the documented set", () => {
    assertEquals(
      RECOVERABLE_STATUSES,
      new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]),
    );
  });
});

describe("recovery policy constants", () => {
  it("allows up to 3 recovery attempts", () => {
    assertEquals(MAX_RECOVERY_ATTEMPTS, 3);
  });

  it("has a backoff schedule with exponential growth", () => {
    assertEquals(RECOVERY_BACKOFF_MS.length, 3);
    assertEquals(RECOVERY_BACKOFF_MS[0], 1000);
    assertEquals(RECOVERY_BACKOFF_MS[1], 2000);
    assertEquals(RECOVERY_BACKOFF_MS[2], 4000);
    // Each delay is strictly greater than the previous (backoff grows).
    for (let i = 1; i < RECOVERY_BACKOFF_MS.length; i++) {
      assertEquals(
        RECOVERY_BACKOFF_MS[i] > RECOVERY_BACKOFF_MS[i - 1],
        true,
        "backoff must increase",
      );
    }
  });

  it("has at least as many backoff entries as max attempts", () => {
    assertEquals(
      RECOVERY_BACKOFF_MS.length >= MAX_RECOVERY_ATTEMPTS,
      true,
    );
  });
});
