"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { inviteStoreMemberAction, upsertStoreMemberAction } from "@/app/actions/team";
import { DepthButton } from "@/components/ui/depth-button";
import { Store } from "@/lib/types";

export interface TeamMemberRow {
  id: string;
  store_id: string;
  user_id: string;
  role: "ADMIN" | "STAFF";
  is_active: boolean;
  permissions: Record<string, boolean> | null;
  last_active_at: string | null;
  user_profiles: { full_name: string | null; email: string | null } | null;
}

interface TeamManagerProps {
  store: Store;
  members: TeamMemberRow[];
}

const permissionKeys = [
  "can_view_history",
  "can_print_pdf",
  "can_view_reports",
  "can_export_data",
  "can_create_closing",
  "can_view_only_own_entries"
] as const;

export const TeamManager = ({ store, members }: TeamManagerProps) => {
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-5">
      <section className="surface p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">
          Invite Staff / Admin
        </h3>
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const email = String(formData.get("email") ?? "");
            const full_name = String(formData.get("full_name") ?? "");
            const role = String(formData.get("role") ?? "STAFF") as "ADMIN" | "STAFF";
            startTransition(async () => {
              try {
                await inviteStoreMemberAction({
                  store_id: store.id,
                  email,
                  full_name,
                  role,
                  permissions: role === "ADMIN" ? {} : { can_create_closing: true }
                });
                toast.success("Member invited.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Invite failed.");
              }
            });
          }}
        >
          <input className="field" name="email" placeholder="staff@email.com" required />
          <input className="field" name="full_name" placeholder="Full name" required />
          <select className="field" name="role" defaultValue="STAFF">
            <option value="STAFF">STAFF</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <DepthButton type="submit" disabled={pending}>
            {pending ? "Inviting..." : "Invite"}
          </DepthButton>
        </form>
      </section>

      <section className="surface overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/70">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Active</th>
              <th className="px-4 py-3">Permissions</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-t border-white/10 align-top">
                <td className="px-4 py-3">
                  <p>{member.user_profiles?.full_name ?? "Unnamed"}</p>
                  <p className="text-xs text-white/60">{member.user_profiles?.email}</p>
                </td>
                <td className="px-4 py-3">{member.role}</td>
                <td className="px-4 py-3">{member.is_active ? "Active" : "Disabled"}</td>
                <td className="px-4 py-3 text-xs text-white/70">
                  {member.last_active_at
                    ? new Date(member.last_active_at).toLocaleString()
                    : "Unknown"}
                </td>
                <td className="px-4 py-3">
                  <div className="grid gap-1">
                    {permissionKeys.map((key) => (
                      <label key={key} className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          defaultChecked={Boolean(member.permissions?.[key])}
                          onChange={(event) => {
                            const nextPermissions = {
                              ...(member.permissions ?? {}),
                              [key]: event.target.checked
                            };
                            startTransition(async () => {
                              try {
                                await upsertStoreMemberAction({
                                  store_id: member.store_id,
                                  user_id: member.user_id,
                                  role: member.role,
                                  is_active: member.is_active,
                                  permissions: nextPermissions
                                });
                                toast.success("Permissions updated.");
                              } catch (error) {
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Failed to update permissions."
                                );
                              }
                            });
                          }}
                        />
                        <span>{key}</span>
                      </label>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="rounded border border-white/20 px-3 py-1 text-xs hover:bg-white/10"
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await upsertStoreMemberAction({
                            store_id: member.store_id,
                            user_id: member.user_id,
                            role: member.role,
                            is_active: !member.is_active,
                            permissions: member.permissions ?? {}
                          });
                          toast.success(
                            member.is_active ? "Member disabled." : "Member re-enabled."
                          );
                        } catch (error) {
                          toast.error(
                            error instanceof Error ? error.message : "Action failed."
                          );
                        }
                      })
                    }
                  >
                    {member.is_active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-white/60">
                  No team members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
};
