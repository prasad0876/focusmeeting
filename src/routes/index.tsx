import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "@/components/PublicPage";
import { pageHead } from "@/lib/page-head";
import { Button } from "@/components/ui/button";
import meetingPhoto from "@/assets/public-meetings.jpg";

export const Route = createFileRoute("/")({
  head: () => ({ ...pageHead("Private institutional video meetings", "Discover focus.meet’s section invitations, video meetings, moderation, and meeting memory, with clear privacy information."), links: [{ rel: "canonical", href: "https://focusmeeting.lovable.app/" }] }),
  component: HomePage,
});
function HomePage() {
  return <PublicPage title="focus.meet" subtitle="Video meetings for adult institutional communities, with section-based invitations and AI-assisted moderation.">
    <figure>
      <img src={meetingPhoto} width={1280} height={720} alt="Illustration of an instructor participating in an online video lesson" className="aspect-video w-full max-w-3xl rounded-md object-cover" />
      <figcaption className="mt-2 text-xs text-muted-foreground">Illustrative image; not an actual focus.meet session.</figcaption>
    </figure>
    <section><h2>Invitations stay within your institution</h2><p>Hosts invite people through their accounts rather than distributing public meeting links. When creating a meeting, an authorised host can select a section to invite its enrolled students. Membership and access permissions determine which meetings an account can join.</p></section>
    <section><h2>Before, during, and after a meeting</h2><p>Review your invitations after signing in. Before connecting, read the microphone and AI-processing notice. In the room, use camera, microphone, screen sharing, and chat controls. Turn off devices when they are not needed and leave when you have finished. Meeting memory provides saved transcripts and generated summaries for authorised users.</p><Button asChild className="mt-5"><Link to="/auth">Sign in to your institution</Link></Button></section>
    <section><h2>Moderation supports safer conversations</h2><p>Chat and microphone transcripts are classified for abusive language. Depending on severity, moderation can warn, mute, alert the host, or remove a participant. Speech is processed in approximately 12-second chunks. AI can miss context or make mistakes: it does not replace an attentive host or institutional safeguarding procedures.</p></section>
    <section><h2>Prepare a respectful online classroom</h2><ul className="list-disc pl-5 space-y-2"><li>Check that the correct students are enrolled before inviting a section.</li><li>Tell participants about transcription and AI processing before they speak.</li><li>Close unrelated windows and private student records before sharing your screen.</li><li>Use headphones where possible to reduce echo and accidental disclosure.</li><li>Ask the host or your institution to review a moderation concern rather than escalating it in chat.</li></ul></section>
    <section><h2>Institutional meeting guide</h2><p>Plan section access, troubleshoot classroom audio, protect student records during screen sharing, and review generated meeting memory responsibly. Read the <Link to="/meeting-guide">meeting guide</Link> for practical classroom decisions and moderation limitations.</p></section>
    <section><h2>Understand the privacy trade-offs</h2><p>Live video and audio travel through LiveKit Cloud. Microphone audio is sent for transcription through Lovable’s AI gateway; chat and transcripts are processed for moderation and meeting memory. App records are stored in Lovable Cloud. There is no claim that video stays entirely on the device or that every meeting is free from disruption.</p><p className="mt-3">Read the <Link to="/privacy">privacy notice</Link> and <Link to="/safety">safety guidelines</Link> before using the service. Advertising is currently disabled, including on private meetings and student records.</p></section>
  </PublicPage>;
}
