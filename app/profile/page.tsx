import AppShell from "@/components/layout/AppShell";
import ProfileGuard from "@/components/profile/ProfileGuard";
import ProfileDashboard from "@/components/profile/ProfileDashboard";

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileGuard>
        <ProfileDashboard />
      </ProfileGuard>
    </AppShell>
  );
}
