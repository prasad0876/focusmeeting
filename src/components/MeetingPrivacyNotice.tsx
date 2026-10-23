import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { canAcknowledgeMeeting } from "@/lib/privacy-policy";

export function MeetingPrivacyNotice({ onAccept }: { onAccept: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  return <div className="mx-auto max-w-2xl px-6 py-12 space-y-6">
    <ShieldCheck className="size-8 text-primary" />
    <h1 className="text-2xl font-semibold">Before you join</h1>
    <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
      <p>Your camera, microphone, and screen shares are transmitted through LiveKit Cloud to meeting participants.</p>
      <p>Microphone audio is captured in approximately 12-second chunks and sent through Lovable’s AI gateway for transcription. Chat and transcripts are processed using AI for abuse detection. Transcript text, speaker details, chat, and moderation incidents are saved in Lovable Cloud; authorised users can access meeting memory.</p>
      <p>You can turn off your camera or microphone or leave at any time. Earlier saved information is not deleted when you leave. Ask your institution administrator about access and deletion. This service is for participants aged 18 and older.</p>
      <p>Advertising is disabled. This acknowledgement is not advertising consent. Read the <Link to="/privacy" className="text-primary underline underline-offset-4">privacy notice</Link> before continuing.</p>
    </div>
    <label className="flex items-start gap-3 text-sm leading-relaxed">
      <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 size-4 accent-primary" />
      <span>I understand the meeting audio, chat, and AI processing described above and choose to join.</span>
    </label>
    <label className="flex items-start gap-3 text-sm leading-relaxed">
      <input type="checkbox" checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.target.checked)} className="mt-1 size-4 accent-primary" />
      <span>I confirm that I am 18 years of age or older.</span>
    </label>
    <div className="flex flex-wrap gap-3">
      <Button disabled={!canAcknowledgeMeeting(acknowledged, adultConfirmed)} onClick={onAccept}>Agree and join meeting</Button>
      <Button asChild variant="outline"><Link to="/dashboard">Not now</Link></Button>
    </div>
  </div>;
}