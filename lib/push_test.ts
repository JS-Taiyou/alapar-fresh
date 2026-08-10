import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { PUSH_COOLDOWN, shouldSendPush } from "./push.ts";

describe("shouldSendPush", () => {
  it("allows the first-ever push (now is large, lastPush = 0)", () => {
    // In production lastPushAt.get(key) ?? 0 starts at 0, and Date.now() is a
    // large epoch ms — so the first push is always well past the cooldown.
    assertEquals(shouldSendPush(1_700_000_000_000, 0), true);
  });

  it("blocks a push when now is small and lastPush is 0 (still within window)", () => {
    // Edge: if now itself is < cooldown, even a "first" push is blocked. This
    // can't happen in production (epoch ms >> cooldown) but documents the math.
    assertEquals(shouldSendPush(1000, 0), false);
  });

  it("blocks a push within the cooldown window", () => {
    const last = 10_000;
    assertEquals(shouldSendPush(last + PUSH_COOLDOWN - 1, last), false);
  });

  it("allows a push exactly at the cooldown boundary", () => {
    const last = 10_000;
    assertEquals(shouldSendPush(last + PUSH_COOLDOWN, last), true);
  });

  it("allows a push after the cooldown has elapsed", () => {
    const last = 10_000;
    assertEquals(shouldSendPush(last + PUSH_COOLDOWN + 5_000, last), true);
  });

  it("respects a custom cooldown argument", () => {
    // With a 5s cooldown, a push 6s after the last is allowed.
    assertEquals(shouldSendPush(6_000, 0, 5_000), true);
    // 4s after is not.
    assertEquals(shouldSendPush(4_000, 0, 5_000), false);
  });

  it("treats equal now and lastPush as at-boundary (allowed) when cooldown is 0", () => {
    assertEquals(shouldSendPush(5_000, 5_000, 0), true);
  });
});
