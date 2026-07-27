import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, LayoutDashboard, Inbox, Plus, LogOut, Crown, ClipboardList, CalendarCheck, GraduationCap, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMyRole } from "@/hooks/use-my-role";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const [handle, setHandle] = useState<string>("");
  const { role, status, isAdmin, isDeo, isHod, canManageInstitution, canTeach } = useMyRole(user.id);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("handle, display_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setHandle(data.handle);
      });
  }, [user.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/60 bg-surface/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2 group">
            <div className="size-8 rounded-md bg-primary/15 grid place-items-center glow-ring">
              <ShieldCheck className="size-4 text-primary" />
            </div>
            <span className="font-semibold tracking-tight">focus<span className="text-primary">.</span>meet</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/dashboard" icon={<LayoutDashboard className="size-4" />} label="Dashboard" />
            {status === "active" && (
              <>
                <NavLink to="/invitations" icon={<Inbox className="size-4" />} label="Invitations" />
                {canTeach && <NavLink to="/new-meeting" icon={<Plus className="size-4" />} label="New meeting" />}
                <NavLink to="/assessments" icon={<ClipboardList className="size-4" />} label="Assessments" />
                {canTeach && <NavLink to="/attendance" icon={<CalendarCheck className="size-4" />} label="Attendance" />}
                {canTeach && <NavLink to="/gradebook" icon={<GraduationCap className="size-4" />} label="Gradebook" />}
                {canTeach && <NavLink to="/roster" icon={<Users className="size-4" />} label="Roster" />}
                {(isAdmin || isDeo) && <NavLink to="/admin" icon={<Crown className="size-4" />} label={isAdmin ? "Admin" : "DEO"} />}
                {isHod && <NavLink to="/admin" icon={<Crown className="size-4" />} label="HOD" />}
              </>
            )}
          </nav>
          <div className="flex items-center gap-3">
            {handle && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-md bg-secondary/60 border border-border/60">
                <span className={`size-1.5 rounded-full ${status === "active" ? "bg-success animate-pulse" : "bg-warning"}`} />
                @{handle}
                {role && status === "active" && <span className="uppercase text-[10px] text-primary">· {role}</span>}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        {status === "pending" ? <PendingScreen /> : status === "rejected" ? <RejectedScreen /> : <Outlet />}
      </main>
    </div>
  );
}

function PendingScreen() {
  return (
    <div className="max-w-lg mx-auto px-6 py-20">
      <Card className="p-8 text-center bg-surface border-border/60 space-y-3">
        <Clock className="size-10 mx-auto text-warning" />
        <h2 className="text-xl font-semibold">Awaiting approval</h2>
        <p className="text-sm text-muted-foreground">
          Your account is pending review. An admin or DEO will assign you a role and section shortly.
        </p>
      </Card>
    </div>
  );
}
function RejectedScreen() {
  return (
    <div className="max-w-lg mx-auto px-6 py-20">
      <Card className="p-8 text-center bg-surface border-border/60 space-y-3">
        <ShieldCheck className="size-10 mx-auto text-destructive" />
        <h2 className="text-xl font-semibold">Access denied</h2>
        <p className="text-sm text-muted-foreground">Your sign-up was not approved. Please contact your institution.</p>
      </Card>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition flex items-center gap-2"
      activeProps={{ className: "text-foreground bg-secondary/80" }}
    >
      {icon}
      {label}
    </Link>
  );
}
