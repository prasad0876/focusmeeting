import { describe, expect, test } from "bun:test";
import { advertisingPolicy } from "./advertising-policy";
describe("AdSense privacy safeguards", () => {
  test("ads remain disabled without consent integration", () => {
    expect(advertisingPolicy.advertisingEnabled).toBe(false);
    expect(advertisingPolicy.personalisedAdvertisingEnabled).toBe(false);
  });
  test("child-directed advertising is not enabled", () => {
    expect(advertisingPolicy.childDirectedAdvertisingEnabled).toBe(false);
  });
  test("verification uses the supplied publisher ID", () => {
    expect(advertisingPolicy.publisherId).toBe("ca-pub-3061308186729716");
  });
});