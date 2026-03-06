import { requireAdmin } from "@/lib/auth";
import { getAuditLogForStore } from "@/lib/data/team";
import { formatDateTime } from "@/lib/utils";

export default async function AuditPage() {
  const context = await requireAdmin();
  const logs = await getAuditLogForStore(context.activeStore!.id);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-bold">Audit Log</h2>
        <p className="text-sm text-white/70">
          Field-level before/after snapshots for admin oversight.
        </p>
      </header>

      <section className="surface overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/70">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Table</th>
              <th className="px-4 py-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-white/10 align-top">
                <td className="px-4 py-3">{formatDateTime(log.created_at)}</td>
                <td className="px-4 py-3">{log.action_type}</td>
                <td className="px-4 py-3">{log.table_name}</td>
                <td className="px-4 py-3 text-xs text-white/75">{log.reason ?? "-"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-white/60">
                  No audit records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
