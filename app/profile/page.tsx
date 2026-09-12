import { Suspense } from "react";
import AppShell from "@/components/layout/AppShell";
import ProfileGuard from "@/components/profile/ProfileGuard";
import ProfileDashboard from "@/components/profile/ProfileDashboard";

export default function ProfilePage() {
  return (
    <AppShell>
      {/* ProfileDashboard reads ?tab= via useSearchParams(), which bails out
          of static rendering up to the nearest Suspense boundary — without
          this, `next build` fails on this (otherwise static) route. */}
      <Suspense
        fallback={
          <p className="text-neon-cyan font-mono text-sm tracking-widest">
            [ CARGANDO... ]
          </p>
        }
      >
        <ProfileGuard>
          <ProfileDashboard />
        </ProfileGuard>
      </Suspense>
    </AppShell>
  );
}
