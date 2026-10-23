import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { privacyPolicy, canAcknowledgeMeeting } from "./privacy-policy";

describe("Owner-selected privacy rules", () => {
  it("limits participation to adults aged 18 and older", () => {
    assert.equal(privacyPolicy.minimumAge, 18);
    assert.equal(canAcknowledgeMeeting(true, false), false);
    assert.equal(canAcknowledgeMeeting(true, true), true);
  });
  it("requires processing acknowledgement independently of adult confirmation", () => {
    assert.equal(canAcknowledgeMeeting(false, true), false);
  });
  it("sets a 30-day target for meeting content", () => {
    assert.equal(privacyPolicy.meetingContentRetentionDays, 30);
  });
  it("sets a 90-day target for moderation incidents", () => {
    assert.equal(privacyPolicy.moderationRetentionDays, 90);
  });
  it("does not promise automatic deletion or invent a contact email", () => {
    assert.equal(privacyPolicy.automaticDeletionEnabled, false);
    assert.equal(privacyPolicy.contactEmail, null);
  });
});