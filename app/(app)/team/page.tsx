import { requireAdmin } from "@/lib/auth";
import { getStoreMembers } from "@/lib/data/team";
import { TeamManager, TeamMemberRow } from "@/components/team/team-manager";

export default async function TeamPage() {
  const context = await requireAdmin();
  const store = context.activeStore!;
  const members = await getStoreMembers(store.id);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-bold">Store Team Management</h2>
        <p className="text-sm text-white/70">
          Add staff, assign roles, and tune granular permissions.
        </p>
      </header>
      <TeamManager store={store} members={members as TeamMemberRow[]} />
    </div>
  );
}
