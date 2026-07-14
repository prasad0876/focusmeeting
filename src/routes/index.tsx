import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Eye, Brain, Sparkles, Lock, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "focusmeet" },
      { name: "description", content: "Direct app-to-app video meetings with AI abuse detection and privacy-first focus monitoring. No links, no leaks, no harassment." },
      { property: "og:title", content: "focusmeet" },
      { property: "og:description", content: "Direct app-to-app video meetings with AI abuse detection and privacy-first focus monitoring. No links, no leaks, no harassment." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-50 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <header className="relative max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-md bg-primary/15 grid place-items-center glow-ring">
            <ShieldCheck className="size-4 text-primary" />
          </div>
          <span className="font-semibold tracking-tight">Sentinel<span className="text-primary">.</span>meet</span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#security" className="hover:text-foreground">Security</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/auth">Sign in</Link></Button>
          <Button asChild size="sm"><Link to="/auth">Get a User ID</Link></Button>
        </div>
      </header>

      <main className="relative">
        {/* Hero */}
        <section className="max-w-5xl mx-auto px-6 pt-20 pb-28 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-surface/60 text-xs font-mono uppercase tracking-widest text-primary">
            <span className="size-1.5 rounded-full bg-success pulse-ring" />
            AI-powered · enterprise preview
          </span>
          <h1 className="mt-6 text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
            Meetings that <span className="text-gradient">no one</span><br />
            can crash, leak, or hijack.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Sentinel replaces shareable links with verified User IDs. AI moderates abuse the moment it's typed.
            Computer vision measures focus, on-device, and tells the host when the room drifts.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
            <Button asChild size="lg"><Link to="/auth">Claim your @handle</Link></Button>
            <Button asChild variant="secondary" size="lg"><a href="#features">See how it works</a></Button>
          </div>

          <div className="mt-16 mx-auto max-w-3xl">
            <div className="rounded-2xl border border-border/60 bg-surface/60 backdrop-blur p-2 glow-ring">
              <div className="rounded-xl bg-background/80 p-6 font-mono text-xs text-left space-y-2 text-muted-foreground">
                <p><span className="text-primary">→</span> host @ada creates "Q4 sync"</p>
                <p><span className="text-primary">→</span> invitees: @grace, @linus, @hedy</p>
                <p><span className="text-success">✓</span> 3 verified IDs · 0 public links generated</p>
                <p><span className="text-warning">⚠</span> @hedy: chat flagged · severity: moderate · auto-muted</p>
                <p><span className="text-warning">⚠</span> room focus 41% · suggested action: interactive poll</p>
                <p><span className="text-success">✓</span> meeting ended · transcript, focus, incidents archived</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="max-w-7xl mx-auto px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-mono uppercase tracking-widest text-primary">Core capabilities</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight">Four systems, one safer room.</h2>
          </div>
          <div className="mt-12 grid md:grid-cols-2 gap-4">
            <Feature icon={<Lock className="size-5" />} title="Verified User IDs" copy="Every account ships with a unique @handle. Invitations are delivered directly through the app. No URLs, no leaks, no uninvited guests." />
            <Feature icon={<ShieldCheck className="size-5" />} title="AI abuse detection" copy="Each message is classified for hate speech, harassment, threats and personal attacks. Sentinel warns, mutes, alerts the host, or removes the user automatically." />
            <Feature icon={<Eye className="size-5" />} title="Privacy-first focus" copy="Attention is measured locally. No video leaves the device. Only the score reaches the server, and only the host sees the aggregate." />
            <Feature icon={<Brain className="size-5" />} title="Adaptive host coach" copy="When more than half the room drifts, the host gets concrete suggestions — switch to a question, run a poll, take a break." />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="max-w-7xl mx-auto px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-mono uppercase tracking-widest text-primary">How it works</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight">From host to verified join in three steps.</h2>
          </div>
          <ol className="mt-12 grid md:grid-cols-3 gap-4">
            <Step n="01" title="Host creates a meeting" copy="Pick a title, then add invitees by their @handle. No link is generated — ever." />
            <Step n="02" title="Invitees get an in-app notification" copy="Only verified User IDs can see and accept. Strangers cannot reach the room." />
            <Step n="03" title="Sentinel watches the room" copy="AI moderates chat, focus is measured locally, and the host sees a live engagement signal." />
          </ol>
        </section>

        {/* Security */}
        <section id="security" className="max-w-7xl mx-auto px-6 py-20">
          <div className="rounded-2xl border border-border/60 bg-surface/60 p-10 md:p-14 relative overflow-hidden">
            <div className="absolute inset-0 grid-bg opacity-30" />
            <div className="relative grid md:grid-cols-2 gap-10 items-center">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-primary">Security model</p>
                <h2 className="mt-3 text-4xl font-semibold tracking-tight">Identity at the door. AI at the table.</h2>
                <p className="mt-4 text-muted-foreground max-w-md">
                  Authentication is enforced server-side per row. Camera feeds stay local — only anonymous focus scores leave the device.
                  Repeated severe abuse drops reputation, then blacklists the account.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Public links" value="0" />
                <Stat label="Verified IDs" value="100%" />
                <Stat label="Abuse latency" value="<2s" />
                <Stat label="Raw video shared" value="None" />
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-3xl mx-auto px-6 pb-32 text-center">
          <Sparkles className="size-6 text-primary mx-auto" />
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Get your verified User ID.</h2>
          <p className="mt-3 text-muted-foreground">Free preview. No public links will ever be generated for your account.</p>
          <Button asChild size="lg" className="mt-6"><Link to="/auth">Create my @handle</Link></Button>
        </section>
      </main>

      <footer className="relative border-t border-border/60 py-8 text-center text-xs font-mono text-muted-foreground">
        <Activity className="size-3 inline mr-1" /> Sentinel.meet · enterprise preview · {new Date().getFullYear()}
      </footer>
    </div>
  );
}

function Feature({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 p-6 hover:border-primary/40 transition">
      <div className="size-10 rounded-lg bg-primary/15 grid place-items-center text-primary">{icon}</div>
      <h3 className="mt-4 font-medium text-lg">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{copy}</p>
    </div>
  );
}

function Step({ n, title, copy }: { n: string; title: string; copy: string }) {
  return (
    <li className="rounded-xl border border-border/60 bg-surface/60 p-6">
      <span className="text-xs font-mono text-primary">{n}</span>
      <h3 className="mt-3 font-medium text-lg">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{copy}</p>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-5">
      <p className="text-3xl font-semibold tabular-nums text-gradient">{value}</p>
      <p className="mt-1 text-xs font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
