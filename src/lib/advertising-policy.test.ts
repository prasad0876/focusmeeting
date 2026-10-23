import { describe, it as test } from "node:test";
import { strict as assert } from "node:assert";
import { advertisingPolicy } from "./advertising-policy";
describe("AdSense privacy safeguards", () => {
  test("ads remain disabled without consent integration", () => {
    assert.equal(advertisingPolicy.advertisingEnabled, false);
    assert.equal(advertisingPolicy.personalisedAdvertisingEnabled, false);
  });
  test("child-directed advertising is not enabled", () => {
    assert.equal(advertisingPolicy.childDirectedAdvertisingEnabled, false);
  });
  test("verification uses the supplied publisher ID", () => {
    assert.equal(advertisingPolicy.publisherId, "ca-pub-3061308186729716");
  });
});