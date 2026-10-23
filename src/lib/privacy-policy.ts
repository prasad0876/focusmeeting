// Published targets, not a claim that scheduled deletion is implemented.
export const privacyPolicy = {
  operatorName: "Secure connect",
  minimumAge: 18,
  meetingContentRetentionDays: 30,
  moderationRetentionDays: 90,
  automaticDeletionEnabled: false,
  contactEmail: "l44539994@gmail.com",
} as const;

export function canAcknowledgeMeeting(processingAccepted: boolean, adultConfirmed: boolean) {
  return processingAccepted && adultConfirmed;
}