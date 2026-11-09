import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  HardDrive,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Download,
  RefreshCw,
  Archive,
  Clock,
  Sliders,
  ArrowLeft,
} from 'lucide-react';
import {
  brainStore,
  DatabaseBackupItem,
  DatabaseStatusPayload,
} from '../services/brainStorage';

interface DatabaseSettingsViewProps {
  onBackToWorkspace?: () => void;
  onAfterRestore?: () => void;
}

function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatBackupKindLabel(kind: DatabaseBackupItem['kind']): {
  label: string;
  className: string;
} {
  switch (kind) {
    case 'pre-migration':
      return {
        label: 'Pre-Migration',
        className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      };
    case 'pre-restore-safety':
      return {
        label: 'Pre-Restore Safety',
        className: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
      };
    default:
      return {
        label: 'Manual Snapshot',
        className: 'border-white/15 bg-white/[0.05] text-white/80',
      };
  }
}

export const DatabaseSettingsView: React.FC<DatabaseSettingsViewProps> = ({
  onBackToWorkspace,
  onAfterRestore,
}) => {
  const [statusData, setStatusData] = useState<DatabaseStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [creatingBackup, setCreatingBackup] = useState<boolean>(false);
  const [savingRetention, setSavingRetention] = useState<boolean>(false);
  const [restoringFileName, setRestoringFileName] = useState<string | null>(null);
  const [confirmRestoreTarget, setConfirmRestoreTarget] =
    useState<DatabaseBackupItem | null>(null);
  const [retentionInput, setRetentionInput] = useState<string>('10');

  const [banner, setBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const loadDatabaseStatus = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await brainStore.fetchDatabaseStatus();
      setStatusData(data);
      setRetentionInput(String(data.retention?.maxBackups ?? 10));
    } catch (err: any) {
      setBanner({
        type: 'error',
        message:
          err?.message ||
          'Unable to load SQLite database status from local Argon server.',
      });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatabaseStatus(false);
  }, [loadDatabaseStatus]);

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    setBanner(null);
    try {
      const res = await brainStore.createDatabaseBackup();
      await loadDatabaseStatus(true);
      setBanner({
        type: 'success',
        message: `Created verified SQLite snapshot "${res.backup.fileName}" (${formatByteSize(
          res.backup.sizeBytes
        )}, ${res.backup.factsCount} facts).`,
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Failed to create SQLite backup.',
      });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleApplyRetention = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number.parseInt(retentionInput, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      setBanner({
        type: 'warning',
        message:
          'Retention count must be a whole number between 1 and 100 verified backups.',
      });
      return;
    }

    setSavingRetention(true);
    setBanner(null);
    try {
      const res = await brainStore.updateBackupRetention(parsed);
      await loadDatabaseStatus(true);
      const deletedCount = res.retentionResult.deletedCount;
      setBanner({
        type: 'success',
        message:
          deletedCount > 0
            ? `Retention policy updated to ${res.maxBackups} backups. Pruned ${deletedCount} older backup(s); last known-good backup preserved.`
            : `Retention policy updated to keep up to ${res.maxBackups} verified backups (${res.retentionResult.keptCount} currently stored).`,
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Failed to apply backup retention policy.',
      });
    } finally {
      setSavingRetention(false);
    }
  };

  const handleConfirmRestore = async (target: DatabaseBackupItem) => {
    setRestoringFileName(target.fileName);
    setBanner(null);
    try {
      const res = await brainStore.restoreDatabaseBackup(target.fileName);
      setStatusData(res.status);
      setConfirmRestoreTarget(null);
      setBanner({
        type: 'success',
        message: res.message,
      });
      if (onAfterRestore) {
        onAfterRestore();
      }
    } catch (err: any) {
      setBanner({
        type: 'error',
        message:
          err?.message ||
          'Database restore failed. Existing live database was preserved.',
      });
      await loadDatabaseStatus(true);
    } finally {
      setRestoringFileName(null);
    }
  };

  const handleDownloadBackup = (backup: DatabaseBackupItem) => {
    if (!backup.verified) {
      setBanner({
        type: 'warning',
        message: `Cannot export "${backup.fileName}" because it did not pass SQLite integrity verification.`,
      });
      return;
    }
    const url = brainStore.getBackupDownloadUrl(backup.fileName);
    const link = document.createElement('a');
    link.href = url;
    link.download = backup.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const backups = statusData?.backups || [];

  return (
    <div className="relative h-full w-full overflow-y-auto px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              {onBackToWorkspace && (
                <button
                  type="button"
                  onClick={onBackToWorkspace}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/[0.03] text-white/70 transition hover:border-white/25 hover:text-white"
                  title="Return to workspace"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <Database className="h-5 w-5 text-emerald-400" />
              <h1 className="text-lg font-semibold tracking-tight text-white">
                Database & Backup Settings
              </h1>
            </div>
            <p className="mt-1 text-xs text-white/55">
              Local SQLite persistence, transactionally consistent snapshots (
              <code className="mono text-white/75">VACUUM INTO</code>), integrity
              verification, and staged restore with automatic safety rollback.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => loadDatabaseStatus(false)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.08] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              <span>Refresh Status</span>
            </button>

            <button
              type="button"
              onClick={handleCreateBackup}
              disabled={creatingBackup || loading}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>
                {creatingBackup ? 'Creating Snapshot…' : 'Create Backup'}
              </span>
            </button>
          </div>
        </div>

        {/* Status / Feedback Banner */}
        {banner && (
          <div
            role="status"
            className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${
              banner.type === 'success'
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                : banner.type === 'warning'
                  ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {banner.type === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    banner.type === 'warning' ? 'text-amber-400' : 'text-rose-400'
                  }`}
                />
              )}
              <span className="leading-relaxed">{banner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="shrink-0 text-white/50 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Section 1: Database Status & Paths */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[#070b18]/90 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                <HardDrive className="h-4 w-4 text-emerald-400" />
                <span>Live SQLite Database</span>
              </div>
              {statusData && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                    statusData.status === 'healthy'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  <ShieldCheck className="h-3 w-3" />
                  {statusData.status === 'healthy'
                    ? 'Healthy · Verified'
                    : 'Degraded'}
                </span>
              )}
            </div>

            <dl className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                <dt className="text-white/50">Database Location</dt>
                <dd className="mono text-white/90">
                  {statusData?.dbLocation || 'data/brain.db'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                <dt className="text-white/50">Engine & Journal Mode</dt>
                <dd className="mono text-white/85">
                  {statusData
                    ? `${statusData.engine} · ${statusData.journalMode.toUpperCase()}`
                    : 'SQLite · WAL'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                <dt className="text-white/50">Schema Version & Integrity</dt>
                <dd className="mono text-white/85">
                  v{statusData?.schemaVersion ?? 4} ·{' '}
                  <span className="text-emerald-400">
                    PRAGMA integrity_check = {statusData?.integrityStatus || 'ok'}
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-white/50">Stored Records & File Size</dt>
                <dd className="mono text-white/90">
                  {statusData?.factsCount ?? 0} facts across{' '}
                  {statusData?.brainsCount ?? 0} brains ·{' '}
                  {formatByteSize(statusData?.dbSizeBytes || 0)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Section 2: Backup Status & Retention Controls */}
          <div className="rounded-xl border border-white/10 bg-[#070b18]/90 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                <Sliders className="h-4 w-4 text-[#9db4ff]" />
                <span>Backup Storage & Retention</span>
              </div>
              <span className="mono text-[11px] text-white/55">
                {statusData?.backupsSummary.verifiedBackups ?? 0} verified /{' '}
                {statusData?.backupsSummary.totalBackups ?? 0} total
              </span>
            </div>

            <dl className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                <dt className="text-white/50">Backup Directory</dt>
                <dd className="mono text-white/90">
                  {statusData?.backupLocation || 'data/backups/'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                <dt className="text-white/50">Latest Verified Backup</dt>
                <dd className="mono text-white/85">
                  {formatTimestamp(statusData?.backupsSummary.latestBackupAt)}
                </dd>
              </div>
            </dl>

            <form
              onSubmit={handleApplyRetention}
              className="mt-3.5 flex flex-wrap items-end justify-between gap-3 pt-1"
            >
              <div className="flex-1 min-w-[180px]">
                <label
                  htmlFor="backup-retention-input"
                  className="block text-[11px] font-medium text-white/65"
                >
                  Max Verified Backups to Retain (1–100)
                </label>
                <p className="text-[10px] text-white/40">
                  Never deletes the last known-good verified snapshot.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="backup-retention-input"
                  type="number"
                  min={1}
                  max={100}
                  value={retentionInput}
                  onChange={(e) => setRetentionInput(e.target.value)}
                  className="mono w-20 rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 text-xs text-white focus:border-white/40 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={savingRetention || loading}
                  className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white transition hover:border-white/30 hover:bg-white/[0.12] disabled:opacity-50"
                >
                  {savingRetention ? 'Applying…' : 'Apply Retention'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Restore Confirmation Dialog (Inline High-Visibility Step) */}
        {confirmRestoreTarget && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div className="flex-1 space-y-2">
                <h2 className="text-sm font-semibold text-white">
                  Confirm Database Restore from{' '}
                  <span className="mono text-amber-300">
                    {confirmRestoreTarget.fileName}
                  </span>
                </h2>
                <p className="text-xs leading-relaxed text-white/75">
                  Before restoring, Argon will automatically create and verify a{' '}
                  <strong className="text-white">
                    Pre-Restore Safety Backup
                  </strong>{' '}
                  of your current live database. The selected backup (
                  {confirmRestoreTarget.factsCount} facts, schema v
                  {confirmRestoreTarget.schemaVersion}, created{' '}
                  {formatTimestamp(confirmRestoreTarget.createdAt)}) will be
                  validated and staged first; if any error occurs, Argon
                  automatically rolls back to your current working database.
                </p>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    disabled={restoringFileName !== null}
                    onClick={() => handleConfirmRestore(confirmRestoreTarget)}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>
                      {restoringFileName === confirmRestoreTarget.fileName
                        ? 'Validating & Restoring…'
                        : 'Confirm & Restore Backup'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={restoringFileName !== null}
                    onClick={() => setConfirmRestoreTarget(null)}
                    className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 3: Available Backups List */}
        <div className="rounded-xl border border-white/10 bg-[#070b18]/90">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-white/60" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white/80">
                Available Backups ({backups.length})
              </h2>
            </div>
            <span className="text-[11px] text-white/45">
              Each snapshot is verified with SQLite{' '}
              <code className="mono text-white/70">PRAGMA integrity_check</code>
            </span>
          </div>

          {loading ? (
            <div className="px-5 py-10 text-center text-xs text-white/50">
              Inspecting SQLite database and verifying snapshots…
            </div>
          ) : backups.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-xs text-white/60">
                No backups are stored in{' '}
                <code className="mono text-white/80">
                  {statusData?.backupLocation || 'data/backups/'}
                </code>{' '}
                yet.
              </p>
              <p className="mt-1 text-[11px] text-white/40">
                Click &ldquo;Create Backup&rdquo; above to capture a verified
                SQLite snapshot.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {backups.map((backup) => {
                const kindBadge = formatBackupKindLabel(backup.kind);
                const isRestoringThis = restoringFileName === backup.fileName;
                return (
                  <div
                    key={backup.fileName}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-white/[0.02]"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mono truncate text-xs font-medium text-white">
                          {backup.fileName}
                        </span>
                        <span
                          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${kindBadge.className}`}
                        >
                          {kindBadge.label}
                        </span>
                        {backup.verified ? (
                          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                            <ShieldCheck className="h-3 w-3" />
                            Verified (ok)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
                            <AlertTriangle className="h-3 w-3" />
                            Invalid ({backup.integrityStatus})
                          </span>
                        )}
                      </div>

                      <div className="mono flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/50">
                        <span>Created: {formatTimestamp(backup.createdAt)}</span>
                        <span>Size: {formatByteSize(backup.sizeBytes)}</span>
                        <span>Schema: v{backup.schemaVersion}</span>
                        <span>Facts: {backup.factsCount}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadBackup(backup)}
                        disabled={!backup.verified}
                        className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          backup.verified
                            ? `Download ${backup.fileName}`
                            : 'Corrupted backups cannot be exported'
                        }
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Export</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmRestoreTarget(backup)}
                        disabled={!backup.verified || isRestoringThis}
                        className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-200 transition hover:border-amber-400/50 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          backup.verified
                            ? `Restore database from ${backup.fileName}`
                            : 'Cannot restore from an unverified or corrupted backup'
                        }
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>
                          {isRestoringThis ? 'Restoring…' : 'Restore'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
