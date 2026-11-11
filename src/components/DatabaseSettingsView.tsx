import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Trash2,
  Upload,
  FileCheck2,
  Settings,
  Cpu,
  Puzzle,
  Sparkles,
  Activity,
  Layers,
  Save,
} from 'lucide-react';
import {
  brainStore,
  DatabaseBackupItem,
  DatabaseStatusPayload,
  ExternalBackupInspectionResult,
} from '../services/brainStorage';
import {
  ArgonGlobalSettings,
  DEFAULT_ARGON_SETTINGS,
  SettingsCategory,
  IngestStrategy,
  DuplicateHandlingPolicy,
  FailedRetryBehaviour,
  BackupScheduleFrequency,
} from '../types/brain';

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
    case 'external-import':
      return {
        label: 'External Import',
        className: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
      };
    case 'scheduled':
      return {
        label: 'Scheduled Auto-Backup',
        className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      };
    case 'post-import':
      return {
        label: 'Post-Import Safety',
        className: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
      };
    default:
      return {
        label: 'Manual Snapshot',
        className: 'border-white/15 bg-white/[0.05] text-white/80',
      };
  }
}

const SETTINGS_CATEGORIES: {
  id: 'all' | SettingsCategory;
  label: string;
  badge: string;
}[] = [
  { id: 'all', label: 'All Settings', badge: '7 Modules' },
  { id: 'general', label: '1. General & Appearance', badge: 'Workspace' },
  { id: 'database', label: '2. Database & Backups', badge: 'SQLite' },
  { id: 'memory', label: '3. Memory & Intelligence', badge: 'Graph & Recall' },
  { id: 'import', label: '4. Import & Processing', badge: '1,000+ Batch' },
  { id: 'connections', label: '5. AI Connections', badge: 'MCP & Providers' },
  { id: 'companion', label: '6. Browser Companion & Devices', badge: 'Tokens' },
  { id: 'diagnostics', label: '7. System & Diagnostics', badge: 'Health' },
];

export const DatabaseSettingsView: React.FC<DatabaseSettingsViewProps> = ({
  onBackToWorkspace,
  onAfterRestore,
}) => {
  const [statusData, setStatusData] = useState<DatabaseStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [creatingBackup, setCreatingBackup] = useState<boolean>(false);
  const [savingRetention, setSavingRetention] = useState<boolean>(false);
  const [exportingFileName, setExportingFileName] = useState<string | null>(null);
  const [restoringFileName, setRestoringFileName] = useState<string | null>(null);
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null);
  const [cleaningInvalid, setCleaningInvalid] = useState<boolean>(false);

  const [confirmRestoreTarget, setConfirmRestoreTarget] =
    useState<DatabaseBackupItem | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] =
    useState<DatabaseBackupItem | null>(null);
  const [retentionInput, setRetentionInput] = useState<string>('10');

  // External Backup Inspection & Restore State
  const [externalFile, setExternalFile] = useState<File | null>(null);
  const [inspectingExternal, setInspectingExternal] = useState<boolean>(false);
  const [externalInspection, setExternalInspection] =
    useState<ExternalBackupInspectionResult | null>(null);
  const [confirmExternalRestore, setConfirmExternalRestore] = useState<boolean>(false);
  const [restoringExternal, setRestoringExternal] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeCategory, setActiveCategory] = useState<'all' | SettingsCategory>('all');
  const [globalSettings, setGlobalSettings] = useState<ArgonGlobalSettings>(() =>
    brainStore.getGlobalSettings()
  );
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [runningScheduledCheck, setRunningScheduledCheck] = useState<boolean>(false);

  const [banner, setBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const loadDatabaseStatus = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [data, syncedSettings] = await Promise.all([
        brainStore.fetchDatabaseStatus(),
        brainStore.syncGlobalSettingsFromBackend(),
      ]);
      setStatusData(data);
      setGlobalSettings(syncedSettings);
      setRetentionInput(String(data.retention?.maxBackups ?? syncedSettings.autoBackup.maxBackups ?? 10));
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

  const handleSaveGlobalSettings = async (
    nextSettings: ArgonGlobalSettings,
    successMsg = 'Saved application settings to SQLite and synchronized active workspace.'
  ) => {
    setSavingSettings(true);
    setBanner(null);
    try {
      const updated = await brainStore.updateGlobalSettings(nextSettings);
      setGlobalSettings(updated);
      await loadDatabaseStatus(true);
      setBanner({
        type: 'success',
        message: successMsg,
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Failed to save global settings.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRunAutoBackupCheckNow = async () => {
    setRunningScheduledCheck(true);
    setBanner(null);
    try {
      const res = await brainStore.runAutoBackupCheck(true, 'scheduled');
      await loadDatabaseStatus(true);
      if (res.triggered && res.backup) {
        setBanner({
          type: 'success',
          message: `Automatic scheduled snapshot created and verified: "${res.backup.fileName}" (${formatByteSize(
            res.backup.sizeBytes
          )}, ${res.backup.factsCount} records, integrity ok).`,
        });
      } else {
        setBanner({
          type: 'warning',
          message: res.error || 'Scheduled backup check completed.',
        });
      }
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Scheduled backup run failed.',
      });
    } finally {
      setRunningScheduledCheck(false);
    }
  };

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
        )}, ${res.backup.factsCount} facts, SQLite format 3\\0 verified).`,
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

  /**
   * Section 9.A: Client-verified binary export.
   * Fetches binary stream, verifies 16-byte "SQLite format 3\0" magic header in browser memory,
   * rejects HTML/cookie-check pages, and triggers download from verified Blob.
   */
  const handleDownloadBackup = async (backup: DatabaseBackupItem) => {
    if (!backup.verified) {
      setBanner({
        type: 'warning',
        message: `Cannot export "${backup.fileName}" because it did not pass SQLite integrity verification.`,
      });
      return;
    }
    setExportingFileName(backup.fileName);
    setBanner(null);
    try {
      const result = await brainStore.exportVerifiedBackupBlob(backup.fileName);
      const blobUrl = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);

      setBanner({
        type: 'success',
        message: `Exported verified binary SQLite backup "${result.fileName}" (${formatByteSize(
          result.sizeBytes
        )} · 16-byte "SQLite format 3\\0" header verified in client memory).`,
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Backup export failed client binary verification.',
      });
    } finally {
      setExportingFileName(null);
    }
  };

  const handleDeleteBackup = async (backup: DatabaseBackupItem) => {
    setDeletingFileName(backup.fileName);
    setBanner(null);
    try {
      const res = await brainStore.deleteDatabaseBackup(backup.fileName);
      setStatusData(res.status);
      setConfirmDeleteTarget(null);
      setBanner({
        type: 'success',
        message: `Deleted backup "${res.deletedFile}".`,
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Failed to delete backup.',
      });
    } finally {
      setDeletingFileName(null);
    }
  };

  const handleCleanupInvalidBackups = async () => {
    setCleaningInvalid(true);
    setBanner(null);
    try {
      const res = await brainStore.cleanupInvalidBackups();
      setStatusData(res.status);
      setBanner({
        type: 'success',
        message:
          res.deletedCount > 0
            ? `Cleaned up ${res.deletedCount} invalid/corrupted backup file(s).`
            : 'No invalid backups found to remove.',
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Failed to clean up invalid backups.',
      });
    } finally {
      setCleaningInvalid(false);
    }
  };

  const handleSelectExternalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExternalFile(file);
    setConfirmExternalRestore(false);
    setInspectingExternal(true);
    setBanner(null);
    try {
      const inspection = await brainStore.inspectExternalBackupFile(file);
      setExternalInspection(inspection);
      if (inspection.valid) {
        setBanner({
          type: 'success',
          message: `Verified external SQLite file "${file.name}": ${inspection.factsCount} records across ${
            Object.keys(inspection.brainsBreakdown || {}).length
          } workspace(s), schema v${inspection.schemaVersion}, PRAGMA integrity_check = ok.`,
        });
      } else {
        setBanner({
          type: 'error',
          message:
            inspection.error ||
            `External file "${file.name}" failed SQLite integrity verification (${inspection.integrityStatus}).`,
        });
      }
    } catch (err: any) {
      setExternalInspection(null);
      setBanner({
        type: 'error',
        message: err?.message || 'Failed to inspect external SQLite file.',
      });
    } finally {
      setInspectingExternal(false);
    }
  };

  const handleRestoreExternalFile = async () => {
    if (!externalFile || !externalInspection?.valid) return;
    setRestoringExternal(true);
    setBanner(null);
    try {
      const res = await brainStore.restoreFromExternalBackupFile(externalFile);
      setStatusData(res.status);
      setConfirmExternalRestore(false);
      setExternalFile(null);
      setExternalInspection(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
          'External database restore failed. Pre-restore live database was preserved.',
      });
      await loadDatabaseStatus(true);
    } finally {
      setRestoringExternal(false);
    }
  };

  const backups = statusData?.backups || [];
  const verifiedCount = backups.filter((b) => b.verified).length;
  const invalidCount = backups.filter((b) => !b.verified).length;
  const showSection = (cat: SettingsCategory) =>
    activeCategory === 'all' || activeCategory === cat;

  return (
    <div className="relative h-full w-full overflow-y-auto px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
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
              <Settings className="h-5 w-5 text-[#9db4ff]" />
              <h1 className="text-lg font-semibold tracking-tight text-white">
                Application Settings & Database Control Centre
              </h1>
              <span className="mono rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
                Database, Backup & Recovery
              </span>
            </div>
            <p className="mt-1 text-xs text-white/55">
              Centralized configuration for General & Appearance, SQLite Database & Scheduled Backups,
              Memory & Intelligence, High-Volume Import & Processing (1,000+ files/batch), AI Connections,
              Browser Companion, and System Diagnostics.
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

        {/* 7-Category Navigation Bar */}
        <div
          role="tablist"
          aria-label="Settings Categories"
          data-testid="settings-category-nav"
          className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-[#070a15] p-2"
        >
          {SETTINGS_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-testid={`settings-tab-${cat.id}`}
                onClick={() => setActiveCategory(cat.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? 'border-[#9db4ff]/50 bg-[#9db4ff]/15 text-white shadow-sm'
                    : 'border-transparent bg-transparent text-white/60 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <span>{cat.label}</span>
                <span className="mono rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/55">
                  {cat.badge}
                </span>
              </button>
            );
          })}
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

        {/* Section 1: Database Status & Retention Controls */}
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
                  v{statusData?.schemaVersion ?? 5} ·{' '}
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

          {/* Section 2: Backup Counts & Retention Controls */}
          <div className="rounded-xl border border-white/10 bg-[#070b18]/90 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                <Sliders className="h-4 w-4 text-[#9db4ff]" />
                <span>Backup Storage & Retention</span>
              </div>
              <div className="flex items-center gap-1.5 mono text-[10.5px]">
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                  {verifiedCount} verified
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 ${
                    invalidCount > 0
                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-300'
                      : 'border-white/10 bg-white/[0.03] text-white/45'
                  }`}
                >
                  {invalidCount} invalid
                </span>
                <span className="rounded border border-white/12 bg-white/[0.04] px-1.5 py-0.5 text-white/75">
                  {backups.length} total
                </span>
              </div>
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

        {/* Section 9.C & 9.D: External Backup Verification & Restore from External .db File */}
        <div className="rounded-xl border border-indigo-500/25 bg-[#070b18]/95 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-300">
                <FileCheck2 className="h-4 w-4 text-indigo-400" />
                <span>Restore from External Backup / Verify Downloaded .db File</span>
              </div>
              <p className="mt-1 text-xs text-white/55">
                Select any downloaded <code className="mono text-white/80">.db</code> or{' '}
                <code className="mono text-white/80">.sqlite</code> backup file from your computer to verify its binary{' '}
                <code className="mono text-white/80">SQLite format 3\0</code> header, inspect its workspace records, or restore it into this Argon installation.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".db,.sqlite,.sqlite3,.bak,application/x-sqlite3,application/octet-stream"
                onChange={handleSelectExternalFile}
                className="hidden"
                id="external-backup-file-input"
              />
              <label
                htmlFor="external-backup-file-input"
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-400/35 bg-indigo-500/15 px-3.5 py-2 text-xs font-semibold text-indigo-200 transition hover:border-indigo-400/60 hover:bg-indigo-500/25"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{inspectingExternal ? 'Inspecting File…' : 'Select External .db File'}</span>
              </label>
            </div>
          </div>

          {externalInspection && (
            <div
              className={`rounded-xl border p-4 text-xs space-y-3 ${
                externalInspection.valid
                  ? 'border-emerald-500/35 bg-emerald-500/[0.06]'
                  : 'border-rose-500/40 bg-rose-500/[0.08]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {externalInspection.valid ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                  )}
                  <span className="mono font-semibold text-white">
                    {externalInspection.fileName}
                  </span>
                  <span className="mono text-[11px] text-white/55">
                    ({formatByteSize(externalInspection.sizeBytes)})
                  </span>
                </div>

                <span
                  className={`mono rounded border px-2 py-0.5 text-[10.5px] font-medium ${
                    externalInspection.valid
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                  }`}
                >
                  {externalInspection.valid
                    ? 'SQLite Header & PRAGMA integrity_check = ok'
                    : `Invalid (${externalInspection.integrityStatus})`}
                </span>
              </div>

              {externalInspection.valid ? (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-1">
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                      <div className="mono text-[10px] uppercase text-white/45">Total Memories</div>
                      <div className="mono mt-0.5 text-sm font-semibold text-white">
                        {externalInspection.factsCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                      <div className="mono text-[10px] uppercase text-white/45">Schema Version</div>
                      <div className="mono mt-0.5 text-sm font-semibold text-white">
                        v{externalInspection.schemaVersion}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                      <div className="mono text-[10px] uppercase text-white/45">Workspaces</div>
                      <div className="mono mt-0.5 text-[11px] text-white/90 truncate">
                        {Object.entries(externalInspection.brainsBreakdown || {})
                          .map(([b, c]) => `${b}: ${c}`)
                          .join(' · ') || 'None'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                      <div className="mono text-[10px] uppercase text-white/45">AI Sources</div>
                      <div className="mono mt-0.5 text-[11px] text-white/90 truncate">
                        {Object.keys(externalInspection.sourcesBreakdown || {}).length} sources
                      </div>
                    </div>
                  </div>

                  {!confirmExternalRestore ? (
                    <div className="flex items-center justify-between gap-3 pt-2">
                      <span className="text-[11px] text-white/60">
                        File passed binary SQLite verification and is ready for staged restore.
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmExternalRestore(true)}
                          className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-300"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Restore from External Backup…</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setExternalFile(null);
                            setExternalInspection(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/75 hover:text-white"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2.5">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                        <div className="space-y-1">
                          <div className="font-semibold text-white">
                            Overwrite Current Database with External Backup &ldquo;{externalInspection.fileName}&rdquo;?
                          </div>
                          <p className="text-[11px] text-white/80 leading-relaxed">
                            Argon will first save a <strong className="text-white">Pre-Restore Safety Backup</strong> of your current database ({statusData?.factsCount ?? 0} facts), stage and migrate the external database ({externalInspection.factsCount} facts), and automatically roll back if any integrity check fails.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          disabled={restoringExternal}
                          onClick={handleRestoreExternalFile}
                          className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>
                            {restoringExternal
                              ? 'Staging & Restoring External DB…'
                              : 'Confirm & Restore External Backup'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={restoringExternal}
                          onClick={() => setConfirmExternalRestore(false)}
                          className="rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white/80 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-rose-200 leading-relaxed">
                  {externalInspection.error ||
                    'This file is not a valid SQLite database and cannot be restored.'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Internal Restore Confirmation Dialog */}
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

        {/* Delete Backup Confirmation Dialog */}
        {confirmDeleteTarget && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/[0.08] p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-xs text-rose-200">
                <Trash2 className="h-4 w-4 shrink-0 text-rose-400" />
                <span>
                  Permanently delete backup file{' '}
                  <strong className="mono text-white">{confirmDeleteTarget.fileName}</strong>?
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={deletingFileName !== null}
                  onClick={() => handleDeleteBackup(confirmDeleteTarget)}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                >
                  {deletingFileName === confirmDeleteTarget.fileName
                    ? 'Deleting…'
                    : 'Confirm Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteTarget(null)}
                  className="rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white/75 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Section 3: Available Backups List */}
        <div className="rounded-xl border border-white/10 bg-[#070b18]/90">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-white/60" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white/80">
                Available Backups ({backups.length})
              </h2>
            </div>
            <div className="flex items-center gap-3">
              {invalidCount > 0 && (
                <button
                  type="button"
                  disabled={cleaningInvalid}
                  onClick={handleCleanupInvalidBackups}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>
                    {cleaningInvalid
                      ? 'Cleaning Invalid…'
                      : `Delete All Invalid (${invalidCount})`}
                  </span>
                </button>
              )}
              <span className="text-[11px] text-white/45">
                Verified with <code className="mono text-white/70">SQLite format 3\0</code> &{' '}
                <code className="mono text-white/70">PRAGMA integrity_check</code>
              </span>
            </div>
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
                const isExportingThis = exportingFileName === backup.fileName;
                const isLastKnownGood = backup.verified && verifiedCount <= 1;

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
                        disabled={!backup.verified || isExportingThis}
                        className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          backup.verified
                            ? `Verify binary header & download ${backup.fileName}`
                            : 'Corrupted backups cannot be exported'
                        }
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>{isExportingThis ? 'Verifying…' : 'Export .db'}</span>
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

                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTarget(backup)}
                        disabled={isLastKnownGood}
                        className="flex items-center justify-center rounded-lg border border-white/12 bg-white/[0.03] p-1.5 text-white/55 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-30"
                        title={
                          isLastKnownGood
                            ? 'Protected: Cannot delete the last remaining verified backup'
                            : `Delete ${backup.fileName}`
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* =====================================================================
            AUTOMATIC BACKUP SCHEDULER (Category 2: Database & Backups)
           ===================================================================== */}
        {showSection('database') && (
          <div
            data-testid="auto-backup-scheduler-panel"
            className="rounded-2xl border border-white/10 bg-[#080b14] p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                  <Clock className="h-4 w-4 text-emerald-400" />
                  <span>Automatic Backup Scheduling & Protection</span>
                </h2>
                <p className="mt-1 text-xs text-white/55">
                  Runs non-destructive <code className="mono text-white/75">VACUUM INTO</code> snapshots on a recurring schedule, verifies SQLite integrity, and preserves the last known-good backup if a scheduled snapshot ever fails.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunAutoBackupCheckNow}
                  disabled={runningScheduledCheck}
                  data-testid="run-scheduled-backup-now-btn"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50 transition"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      runningScheduledCheck ? 'animate-spin' : ''
                    }`}
                  />
                  <span>
                    {runningScheduledCheck
                      ? 'Running Scheduled Snapshot…'
                      : 'Run Scheduled Snapshot Now'}
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 space-y-2">
                <label className="flex items-center justify-between gap-2 text-xs font-medium text-white cursor-pointer">
                  <span>Enable Auto-Backup</span>
                  <input
                    type="checkbox"
                    checked={globalSettings.autoBackup.enabled}
                    onChange={(e) => {
                      const next: ArgonGlobalSettings = {
                        ...globalSettings,
                        autoBackup: {
                          ...globalSettings.autoBackup,
                          enabled: e.target.checked,
                        },
                      };
                      setGlobalSettings(next);
                      handleSaveGlobalSettings(
                        next,
                        `Automatic scheduled backups ${
                          e.target.checked ? 'enabled' : 'disabled'
                        }.`
                      );
                    }}
                    data-testid="auto-backup-enabled-toggle"
                    className="h-4 w-4 rounded border-white/25 bg-black"
                  />
                </label>
                <p className="text-[11px] text-white/45">
                  {globalSettings.autoBackup.enabled
                    ? 'Active background scheduler is monitoring interval.'
                    : 'Scheduled snapshots paused; manual and pre-restore backups remain active.'}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 space-y-1.5">
                <label className="block mono text-[10.5px] text-white/50">
                  Schedule Frequency
                </label>
                <select
                  value={globalSettings.autoBackup.schedule}
                  onChange={(e) => {
                    const nextFreq = e.target.value as BackupScheduleFrequency;
                    const next: ArgonGlobalSettings = {
                      ...globalSettings,
                      autoBackup: {
                        ...globalSettings.autoBackup,
                        schedule: nextFreq,
                      },
                    };
                    setGlobalSettings(next);
                    handleSaveGlobalSettings(
                      next,
                      `Scheduled backup frequency updated to ${nextFreq}.`
                    );
                  }}
                  data-testid="auto-backup-frequency-select"
                  className="mono w-full rounded-lg border border-white/15 bg-black/60 px-2.5 py-1.5 text-xs text-white outline-none"
                >
                  <option value="hourly" className="bg-[#050711]">
                    Hourly (every 60 minutes)
                  </option>
                  <option value="daily" className="bg-[#050711]">
                    Daily (every 24 hours)
                  </option>
                  <option value="weekly" className="bg-[#050711]">
                    Weekly (every 7 days)
                  </option>
                </select>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 space-y-1">
                <span className="block mono text-[10.5px] text-white/50">
                  Last / Next Scheduled Snapshot
                </span>
                <div className="mono text-xs text-white">
                  Last:{' '}
                  {formatTimestamp(
                    statusData?.autoBackup?.lastBackupAt ||
                      globalSettings.autoBackup.lastBackupAt
                  )}
                </div>
                <div className="mono text-[11px] text-emerald-300">
                  Next:{' '}
                  {globalSettings.autoBackup.enabled
                    ? formatTimestamp(
                        statusData?.autoBackup?.nextScheduledBackupAt ||
                          globalSettings.autoBackup.nextScheduledBackupAt
                      )
                    : 'Paused'}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 space-y-1">
                <span className="block mono text-[10.5px] text-white/50">
                  Destination & Error Status
                </span>
                <div className="mono truncate text-xs text-white/85">
                  {statusData?.backupLocation ||
                    globalSettings.autoBackup.backupDirectory ||
                    'data/backups'}
                </div>
                {statusData?.autoBackup?.lastBackupError ||
                globalSettings.autoBackup.lastBackupError ? (
                  <div className="mono text-[11px] text-rose-300">
                    Error:{' '}
                    {statusData?.autoBackup?.lastBackupError ||
                      globalSettings.autoBackup.lastBackupError}
                  </div>
                ) : (
                  <div className="mono text-[11px] text-emerald-400">
                    Healthy · Zero scheduler errors
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            CATEGORY 4: IMPORT & PROCESSING SETTINGS (1,000+ FILES PER BATCH)
           ===================================================================== */}
        {showSection('import') && (
          <div
            data-testid="import-processing-settings-panel"
            className="rounded-2xl border border-white/10 bg-[#080b14] p-5 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#9db4ff]">
                  <Layers className="h-4 w-4 text-[#9db4ff]" />
                  <span>4. Import & Processing Settings (High-Volume Scaling)</span>
                </h2>
                <p className="mt-1 text-xs text-white/55">
                  Configure batch size limits (default: 1,000 files per batch), queue concurrency, default ingestion strategy, duplicate policies, automatic retries, and post-import safety backups. Changes propagate immediately to Capture Hub.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const reset: ArgonGlobalSettings = {
                      ...globalSettings,
                      importProcessing: {
                        ...DEFAULT_ARGON_SETTINGS.importProcessing,
                      },
                    };
                    setGlobalSettings(reset);
                    handleSaveGlobalSettings(
                      reset,
                      'Reset Import & Processing settings to verified defaults (1,000 files/batch, concurrency 3).'
                    );
                  }}
                  className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.08] transition"
                >
                  Reset Defaults
                </button>
                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={() =>
                    handleSaveGlobalSettings(
                      globalSettings,
                      'Saved Import & Processing settings and synchronized Capture Hub.'
                    )
                  }
                  data-testid="save-import-settings-btn"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#9db4ff] px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-[#b4c6ff] disabled:opacity-50 transition"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>
                    {savingSettings ? 'Saving…' : 'Save Import Settings'}
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* Max Files Per Batch */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2">
                <label className="block mono text-[11px] font-semibold text-white">
                  Maximum Files per Batch
                </label>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={globalSettings.importProcessing.maxFilesPerBatch}
                  onChange={(e) =>
                    setGlobalSettings((prev) => ({
                      ...prev,
                      importProcessing: {
                        ...prev.importProcessing,
                        maxFilesPerBatch: Math.max(
                          1,
                          Math.min(5000, parseInt(e.target.value, 10) || 1000)
                        ),
                      },
                    }))
                  }
                  data-testid="settings-max-files-per-batch-input"
                  className="mono w-full rounded-lg border border-white/20 bg-black/70 px-3 py-1.5 text-xs text-white outline-none focus:border-[#9db4ff]"
                />
                <p className="text-[11px] text-white/45">
                  Default: <strong className="text-white/80">1,000</strong> files per batch (supports 1 to 5,000 direct or ZIP-extracted files).
                </p>
              </div>

              {/* Processing Concurrency */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2">
                <label className="block mono text-[11px] font-semibold text-white">
                  Processing Concurrency
                </label>
                <select
                  value={globalSettings.importProcessing.concurrency}
                  onChange={(e) =>
                    setGlobalSettings((prev) => ({
                      ...prev,
                      importProcessing: {
                        ...prev.importProcessing,
                        concurrency: parseInt(e.target.value, 10) || 3,
                      },
                    }))
                  }
                  data-testid="settings-concurrency-select"
                  className="mono w-full rounded-lg border border-white/20 bg-black/70 px-3 py-1.5 text-xs text-white outline-none focus:border-[#9db4ff]"
                >
                  <option value={1} className="bg-[#050711]">
                    1 — Sequential (lowest memory / safest)
                  </option>
                  <option value={2} className="bg-[#050711]">
                    2 — Conservative
                  </option>
                  <option value={3} className="bg-[#050711]">
                    3 — Balanced (default)
                  </option>
                  <option value={5} className="bg-[#050711]">
                    5 — Faster
                  </option>
                  <option value={8} className="bg-[#050711]">
                    8 — High throughput
                  </option>
                  <option value={10} className="bg-[#050711]">
                    10 — Maximum (fast SSD / high RAM)
                  </option>
                </select>
                <p className="text-[11px] text-white/45">
                  Controls parallel worker count during Review Queue persistence.
                </p>
              </div>

              {/* Default Ingestion Strategy */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2">
                <label className="block mono text-[11px] font-semibold text-white">
                  Preferred Default Ingestion Strategy
                </label>
                <select
                  value={globalSettings.importProcessing.defaultStrategy}
                  onChange={(e) =>
                    setGlobalSettings((prev) => ({
                      ...prev,
                      importProcessing: {
                        ...prev.importProcessing,
                        defaultStrategy: e.target.value as IngestStrategy,
                      },
                    }))
                  }
                  data-testid="settings-default-strategy-select"
                  className="mono w-full rounded-lg border border-white/20 bg-black/70 px-3 py-1.5 text-xs text-white outline-none focus:border-[#9db4ff]"
                >
                  <option value="semantic" className="bg-[#050711]">
                    Unified (1 semantic node per file)
                  </option>
                  <option value="branching" className="bg-[#050711]">
                    Branching (Document hub + child section nodes)
                  </option>
                  <option value="chunk" className="bg-[#050711]">
                    Sliced (Fixed character chunks)
                  </option>
                </select>
                <p className="text-[11px] text-white/45">
                  Unified creates 1 record/file; Branching creates 1 hub + child nodes.
                </p>
              </div>

              {/* Default Destination Brain */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2">
                <label className="block mono text-[11px] font-semibold text-white">
                  Default Destination Memory Brain
                </label>
                <select
                  value={globalSettings.importProcessing.defaultBrain}
                  onChange={(e) =>
                    setGlobalSettings((prev) => ({
                      ...prev,
                      importProcessing: {
                        ...prev.importProcessing,
                        defaultBrain: e.target.value,
                      },
                    }))
                  }
                  data-testid="settings-default-brain-select"
                  className="mono w-full rounded-lg border border-white/20 bg-black/70 px-3 py-1.5 text-xs text-white outline-none focus:border-[#9db4ff]"
                >
                  {brainStore.getBrains().map((b) => (
                    <option key={b} value={b} className="bg-[#050711]">
                      {b}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-white/45">
                  Fallback destination workspace when staging new files.
                </p>
              </div>

              {/* Duplicate Detection & Policy */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="mono text-[11px] font-semibold text-white">
                    Default Duplicate Policy
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-white/75 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={
                        globalSettings.importProcessing
                          .duplicateDetectionEnabled
                      }
                      onChange={(e) =>
                        setGlobalSettings((prev) => ({
                          ...prev,
                          importProcessing: {
                            ...prev.importProcessing,
                            duplicateDetectionEnabled: e.target.checked,
                          },
                        }))
                      }
                      className="rounded border-white/25 bg-black"
                    />
                    <span>Enabled</span>
                  </label>
                </div>
                <select
                  value={globalSettings.importProcessing.defaultDuplicatePolicy}
                  onChange={(e) =>
                    setGlobalSettings((prev) => ({
                      ...prev,
                      importProcessing: {
                        ...prev.importProcessing,
                        defaultDuplicatePolicy: e.target
                          .value as DuplicateHandlingPolicy,
                      },
                    }))
                  }
                  data-testid="settings-duplicate-policy-select"
                  className="mono w-full rounded-lg border border-white/20 bg-black/70 px-3 py-1.5 text-xs text-white outline-none focus:border-[#9db4ff]"
                >
                  <option value="skip" className="bg-[#050711]">
                    Skip duplicates by default (Safest)
                  </option>
                  <option value="ask_user" className="bg-[#050711]">
                    Ask user per modified item
                  </option>
                  <option value="merge" className="bg-[#050711]">
                    Merge modified files into existing node
                  </option>
                  <option value="replace" className="bg-[#050711]">
                    Replace existing node with incoming file
                  </option>
                </select>
                <p className="text-[11px] text-white/45">
                  Exact duplicates are always skipped to prevent redundant nodes.
                </p>
              </div>

              {/* Retry & Recovery Behaviour */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="mono text-[11px] font-semibold text-white">
                    Failed-Item Retry Policy
                  </label>
                  <span className="mono text-[10.5px] text-[#9db4ff]">
                    Max {globalSettings.importProcessing.maxRetries} retries
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={globalSettings.importProcessing.failedRetryBehaviour}
                    onChange={(e) =>
                      setGlobalSettings((prev) => ({
                        ...prev,
                        importProcessing: {
                          ...prev.importProcessing,
                          failedRetryBehaviour: e.target
                            .value as FailedRetryBehaviour,
                        },
                      }))
                    }
                    data-testid="settings-retry-behaviour-select"
                    className="mono flex-1 rounded-lg border border-white/20 bg-black/70 px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    <option value="manual" className="bg-[#050711]">
                      Manual retry from queue
                    </option>
                    <option
                      value="auto_retry_transient"
                      className="bg-[#050711]"
                    >
                      Auto-retry transient errors
                    </option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={globalSettings.importProcessing.maxRetries}
                    onChange={(e) =>
                      setGlobalSettings((prev) => ({
                        ...prev,
                        importProcessing: {
                          ...prev.importProcessing,
                          maxRetries: Math.max(
                            0,
                            Math.min(5, parseInt(e.target.value, 10) || 0)
                          ),
                        },
                      }))
                    }
                    aria-label="Maximum retry attempts"
                    className="mono w-16 rounded-lg border border-white/20 bg-black/70 px-2 py-1.5 text-xs text-white outline-none"
                  />
                </div>
                <p className="text-[11px] text-white/45">
                  Failed multi-node writes roll back partial child records atomically.
                </p>
              </div>
            </div>

            {/* Post-Import Verification & Safety Toggles */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 pt-1">
              <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-xs text-white/85 cursor-pointer">
                <span>Automatic Post-Import Verification</span>
                <input
                  type="checkbox"
                  checked={
                    globalSettings.importProcessing.autoVerifyAfterImport
                  }
                  onChange={(e) =>
                    setGlobalSettings((prev) => ({
                      ...prev,
                      importProcessing: {
                        ...prev.importProcessing,
                        autoVerifyAfterImport: e.target.checked,
                      },
                    }))
                  }
                  className="h-4 w-4 rounded border-white/25 bg-black"
                />
              </label>

              <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-xs text-white/85 cursor-pointer">
                <span>Import Completion Notifications</span>
                <input
                  type="checkbox"
                  checked={globalSettings.importProcessing.showNotifications}
                  onChange={(e) =>
                    setGlobalSettings((prev) => ({
                      ...prev,
                      importProcessing: {
                        ...prev.importProcessing,
                        showNotifications: e.target.checked,
                      },
                    }))
                  }
                  className="h-4 w-4 rounded border-white/25 bg-black"
                />
              </label>

              <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-xs text-white/85 cursor-pointer">
                <span>
                  Auto-Backup After Large Imports (≥
                  {globalSettings.importProcessing.largeImportBackupThreshold}{' '}
                  files)
                </span>
                <input
                  type="checkbox"
                  checked={
                    globalSettings.importProcessing.autoBackupAfterLargeImport
                  }
                  onChange={(e) =>
                    setGlobalSettings((prev) => ({
                      ...prev,
                      importProcessing: {
                        ...prev.importProcessing,
                        autoBackupAfterLargeImport: e.target.checked,
                      },
                    }))
                  }
                  className="h-4 w-4 rounded border-white/25 bg-black"
                />
              </label>
            </div>
          </div>
        )}

        {/* =====================================================================
            CATEGORIES 1, 3, 5, 6, 7: GENERAL, MEMORY, AI CONNECTIONS, COMPANION, DIAGNOSTICS
           ===================================================================== */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {showSection('general') && (
            <div
              data-testid="general-appearance-settings-panel"
              className="rounded-2xl border border-white/10 bg-[#080b14] p-5 space-y-3"
            >
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
                <Sparkles className="h-4 w-4 text-[#9db4ff]" />
                <span>1. General & Appearance</span>
              </h2>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/30 px-3.5 py-2">
                  <span className="text-white/65">Default Workspace View</span>
                  <select
                    value={globalSettings.general.defaultViewMode}
                    onChange={(e) => {
                      const next: ArgonGlobalSettings = {
                        ...globalSettings,
                        general: {
                          ...globalSettings.general,
                          defaultViewMode: e.target.value as any,
                        },
                      };
                      setGlobalSettings(next);
                      handleSaveGlobalSettings(next);
                    }}
                    className="mono rounded border border-white/15 bg-black/60 px-2 py-1 text-xs text-white outline-none"
                  >
                    <option value="graph" className="bg-[#050711]">
                      Neural Graph
                    </option>
                    <option value="list" className="bg-[#050711]">
                      Memory Table
                    </option>
                    <option value="sync" className="bg-[#050711]">
                      AI Sync Studio
                    </option>
                  </select>
                </div>
                <label className="flex items-center justify-between rounded-xl border border-white/8 bg-black/30 px-3.5 py-2 cursor-pointer">
                  <span className="text-white/65">
                    Compact Memory Table Density
                  </span>
                  <input
                    type="checkbox"
                    checked={globalSettings.general.compactTableDensity}
                    onChange={(e) => {
                      const next: ArgonGlobalSettings = {
                        ...globalSettings,
                        general: {
                          ...globalSettings.general,
                          compactTableDensity: e.target.checked,
                        },
                      };
                      setGlobalSettings(next);
                      handleSaveGlobalSettings(next);
                    }}
                    className="h-4 w-4 rounded border-white/25 bg-black"
                  />
                </label>
              </div>
            </div>
          )}

          {showSection('memory') && (
            <div
              data-testid="memory-intelligence-settings-panel"
              className="rounded-2xl border border-white/10 bg-[#080b14] p-5 space-y-3"
            >
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
                <Cpu className="h-4 w-4 text-emerald-400" />
                <span>3. Memory & Intelligence</span>
              </h2>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/30 px-3.5 py-2">
                  <span className="text-white/65">
                    Default Graph Physics Layout
                  </span>
                  <select
                    value={globalSettings.general.defaultGraphLayout}
                    onChange={(e) => {
                      const next: ArgonGlobalSettings = {
                        ...globalSettings,
                        general: {
                          ...globalSettings.general,
                          defaultGraphLayout: e.target.value as any,
                        },
                      };
                      setGlobalSettings(next);
                      handleSaveGlobalSettings(next);
                    }}
                    className="mono rounded border border-white/15 bg-black/60 px-2 py-1 text-xs text-white outline-none"
                  >
                    <option value="radial" className="bg-[#050711]">
                      Radial Source Orbit
                    </option>
                    <option value="force" className="bg-[#050711]">
                      Force-Directed Cluster
                    </option>
                    <option value="timeline" className="bg-[#050711]">
                      Chronological Timeline
                    </option>
                  </select>
                </div>
                <label className="flex items-center justify-between rounded-xl border border-white/8 bg-black/30 px-3.5 py-2 cursor-pointer">
                  <span className="text-white/65">
                    Semantic Relationships & Section Diffing
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      globalSettings.memoryIntelligence
                        .enableSemanticRelationships
                    }
                    onChange={(e) => {
                      const next: ArgonGlobalSettings = {
                        ...globalSettings,
                        memoryIntelligence: {
                          ...globalSettings.memoryIntelligence,
                          enableSemanticRelationships: e.target.checked,
                        },
                      };
                      setGlobalSettings(next);
                      handleSaveGlobalSettings(next);
                    }}
                    className="h-4 w-4 rounded border-white/25 bg-black"
                  />
                </label>
              </div>
            </div>
          )}

          {showSection('connections') && (
            <div
              data-testid="ai-connections-settings-panel"
              className="rounded-2xl border border-white/10 bg-[#080b14] p-5 space-y-3"
            >
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
                <Sliders className="h-4 w-4 text-amber-400" />
                <span>5. AI Connections & MCP Bridge</span>
              </h2>
              <div className="space-y-2 text-xs text-white/65">
                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/30 px-3.5 py-2">
                  <span>Local Loopback Gateway Binding</span>
                  <span className="mono text-emerald-400">
                    127.0.0.1:3000 (Strict Local)
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/30 px-3.5 py-2">
                  <span>Supported Sources</span>
                  <span className="mono text-white/85">
                    Claude · ChatGPT · Gemini · Cursor · GitHub · Ollama · Moodle
                  </span>
                </div>
              </div>
            </div>
          )}

          {(showSection('companion') || showSection('diagnostics')) && (
            <div
              data-testid="system-diagnostics-settings-panel"
              className="rounded-2xl border border-white/10 bg-[#080b14] p-5 space-y-3"
            >
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
                <Activity className="h-4 w-4 text-purple-400" />
                <span>6 & 7. Browser Companion & System Diagnostics</span>
              </h2>
              <div className="space-y-2 text-xs text-white/65">
                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/30 px-3.5 py-2">
                  <span>SQLite Engine & Journal Mode</span>
                  <span className="mono text-emerald-400">
                    better-sqlite3 · WAL · Schema v{statusData?.schemaVersion ?? 5}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/30 px-3.5 py-2">
                  <span>Active Batch / Queue Capabilities</span>
                  <span className="mono text-[#9db4ff]">
                    {globalSettings.importProcessing.maxFilesPerBatch.toLocaleString()} files/batch · Concurrency {globalSettings.importProcessing.concurrency}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
