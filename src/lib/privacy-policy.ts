// Published targets, not a claim that scheduled deletion is implemented.
export const privacyPolicy = {
  operatorName: "Secure connect",
  minimumAge: 18,
  meetingContentRetentionDays: 30,
  moderationRetentionDays: 90,
  automaticDeletionEnabled: false,
  contactEmail: null,
} as const;

export function canAcknowledgeMeeting(processingAccepted: boolean, adultConfirmed: boolean) {
  return processingAccepted && adultConfirmed;
}