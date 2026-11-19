import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
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
  Copy,
  Check,
  Play,
  Plus,
  ExternalLink,
  LayoutGrid,
} from 'lucide-react';
import {
  brainStore,
  DatabaseBackupItem,
  DatabaseStatusPayload,
  ExternalBackupInspectionResult,
  CompanionDeviceRecord,
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
import { SecurityAndPortableSection } from './SecurityAndPortableSection';

interface DatabaseSettingsViewProps {
  onBackToWorkspace?: () => void;
  onAfterRestore?: () => void;
  onOpenMcpBridge?: () => void;
  onOpenCompanion?: () => void;
  onOpenActivityLog?: () => void;
  initialCategory?: 'all' | SettingsCategory;
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
  });
}

function formatBackupKindText(kind: DatabaseBackupItem['kind']): {
  label: string;
  colorClass: string;
} {
  switch (kind) {
    case 'pre-migration':
      return { label: 'Pre-Migration', colorClass: 'text-amber-300' };
    case 'pre-restore-safety':
      return { label: 'Pre-Restore Safety', colorClass: 'text-sky-300' };
    case 'external-import':
      return { label: 'External Import', colorClass: 'text-purple-300' };
    case 'scheduled':
      return { label: 'Scheduled', colorClass: 'text-emerald-300' };
    case 'post-import':
      return { label: 'Post-Import Safety', colorClass: 'text-[#9db4ff]' };
    default:
      return { label: 'Manual Snapshot', colorClass: 'text-white/75' };
  }
}

interface NavCategoryItem {
  id: SettingsCategory;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.FC<{ className?: string }>;
}

const SETTINGS_CATEGORIES: NavCategoryItem[] = [
  {
    id: 'general',
    label: '1. General & Appearance',
    shortLabel: '1. General',
    description: 'Default workspace, startup view, graph layout, table density, and motion.',
    icon: Sparkles,
  },
  {
    id: 'database',
    label: '2. Database & Backups',
    shortLabel: '2. Database',
    description: 'Local SQLite health, automatic backup schedule, snapshots, external restore, and portable exports.',
    icon: HardDrive,
  },
  {
    id: 'memory',
    label: '3. Memory & Intelligence',
    shortLabel: '3. Memory',
    description: 'Metadata extraction, folder provenance rules, semantic links, and export defaults.',
    icon: Cpu,
  },
  {
    id: 'import',
    label: '4. Import & Processing',
    shortLabel: '4. Import',
    description: 'High-volume batch limits (up to 5,000 files), concurrency, deduplication, and retries.',
    icon: Layers,
  },
  {
    id: 'connections',
    label: '5. AI Connections',
    shortLabel: '5. AI & MCP',
    description: 'Local Node.js stdio MCP server, HTTP JSON-RPC diagnostics, recall limits, and live smoke tests.',
    icon: Sliders,
  },
  {
    id: 'companion',
    label: '6. Browser Companion & Devices',
    shortLabel: '6. Companion',
    description: 'Pair Chrome/Edge extension tokens, monitor active devices, and revoke access instantly.',
    icon: Puzzle,
  },
  {
    id: 'diagnostics',
    label: '7. System & Diagnostics',
    shortLabel: '7. Diagnostics',
    description: 'SQLite runtime diagnostics, applied migrations, local security posture, and POSIX permissions.',
    icon: Activity,
  },
];

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  testId?: string;
  disabled?: boolean;
}> = ({ checked, onChange, ariaLabel, testId, disabled }) => (
  <label className="relative inline-flex items-center cursor-pointer shrink-0">
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={ariaLabel}
      data-testid={testId}
      className="peer sr-only"
    />
    <span className="h-5 w-9 rounded-full border border-white/15 bg-white/10 transition-colors peer-checked:border-emerald-400/50 peer-checked:bg-emerald-500/75 peer-focus-visible:ring-2 peer-focus-visible:ring-[#9db4ff] peer-disabled:opacity-40" />
    <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
  </label>
);

export const DatabaseSettingsView: React.FC<DatabaseSettingsViewProps> = ({
  onBackToWorkspace,
  onAfterRestore,
  onOpenMcpBridge,
  onOpenCompanion,
  onOpenActivityLog,
  initialCategory = 'all',
}) => {
  const [activeCategory, setActiveCategory] = useState<'all' | SettingsCategory>(
    initialCategory
  );
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

  // External Backup Inspection & Restore
  const [externalFile, setExternalFile] = useState<File | null>(null);
  const [inspectingExternal, setInspectingExternal] = useState<boolean>(false);
  const [externalInspection, setExternalInspection] =
    useState<ExternalBackupInspectionResult | null>(null);
  const [confirmExternalRestore, setConfirmExternalRestore] = useState<boolean>(false);
  const [restoringExternal, setRestoringExternal] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Global Settings State
  const [globalSettings, setGlobalSettings] = useState<ArgonGlobalSettings>(() =>
    brainStore.getGlobalSettings()
  );
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [runningScheduledCheck, setRunningScheduledCheck] = useState<boolean>(false);
  const [importDirty, setImportDirty] = useState<boolean>(false);
  const [confirmResetAll, setConfirmResetAll] = useState<boolean>(false);

  // Category 5: Live MCP Diagnostics & Smoke Test
  const [mcpDiagnostics, setMcpDiagnostics] = useState<any | null>(null);
  const [mcpLoading, setMcpLoading] = useState<boolean>(false);
  const [mcpSmokeRunning, setMcpSmokeRunning] = useState<boolean>(false);
  const [mcpSmokeResult, setMcpSmokeResult] = useState<any | null>(null);

  // Category 6: Browser Companion Devices
  const [companionDevices, setCompanionDevices] = useState<CompanionDeviceRecord[]>([]);
  const [companionLoading, setCompanionLoading] = useState<boolean>(false);
  const [newDeviceName, setNewDeviceName] = useState<string>('');
  const [creatingDevice, setCreatingDevice] = useState<boolean>(false);
  const [issuedToken, setIssuedToken] = useState<{
    deviceName: string;
    token: string;
  } | null>(null);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);

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
      setImportDirty(false);
      setRetentionInput(
        String(data.retention?.maxBackups ?? syncedSettings.autoBackup.maxBackups ?? 10)
      );
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

  const loadMcpDiagnostics = useCallback(async () => {
    setMcpLoading(true);
    try {
      const diag = await brainStore.fetchMcpDiagnostics();
      setMcpDiagnostics(diag);
    } catch {
      // Handled gracefully in UI
    } finally {
      setMcpLoading(false);
    }
  }, []);

  const loadCompanionDevices = useCallback(async () => {
    setCompanionLoading(true);
    try {
      const rows = await brainStore.fetchCompanionDevices();
      setCompanionDevices(rows);
    } catch {
      // Handled gracefully in UI
    } finally {
      setCompanionLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatabaseStatus(false);
  }, [loadDatabaseStatus]);

  useEffect(() => {
    if (activeCategory === 'connections' || activeCategory === 'all') {
      loadMcpDiagnostics();
    }
    if (activeCategory === 'companion' || activeCategory === 'all') {
      loadCompanionDevices();
    }
  }, [activeCategory, loadMcpDiagnostics, loadCompanionDevices]);

  const handleSaveGlobalSettings = async (
    nextSettings: ArgonGlobalSettings,
    successMsg = 'Settings saved and synchronized with SQLite.'
  ) => {
    setSavingSettings(true);
    setBanner(null);
    try {
      const updated = await brainStore.updateGlobalSettings(nextSettings);
      setGlobalSettings(updated);
      setImportDirty(false);
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle(
          'reduce-motion',
          Boolean(updated.general.reducedMotion)
        );
      }
      await loadDatabaseStatus(true);
      setBanner({ type: 'success', message: successMsg });
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Failed to save application settings.',
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
          message: `Scheduled snapshot verified: "${res.backup.fileName}" (${formatByteSize(
            res.backup.sizeBytes
          )}, ${res.backup.factsCount} records).`,
        });
      } else {
        setBanner({
          type: res.error ? 'error' : 'warning',
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
        message: 'Retention count must be a whole number between 1 and 100.',
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
            ? `Retention updated to ${res.maxBackups} backups. Pruned ${deletedCount} older snapshot(s); last known-good backup preserved.`
            : `Retention updated to keep up to ${res.maxBackups} verified backups (${res.retentionResult.keptCount} currently stored).`,
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
      setBanner({ type: 'success', message: res.message });
      if (onAfterRestore) onAfterRestore();
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

  const handleDownloadBackup = async (backup: DatabaseBackupItem) => {
    if (!backup.verified) {
      setBanner({
        type: 'warning',
        message: `Cannot export "${backup.fileName}" because it failed SQLite integrity verification.`,
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
        message: `Exported verified SQLite backup "${result.fileName}" (${formatByteSize(
          result.sizeBytes
        )}).`,
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Backup export failed binary verification.',
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
            ? `Removed ${res.deletedCount} invalid backup file(s).`
            : 'No invalid backups found.',
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

  const handleSelectExternalFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
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
          message: `Verified "${file.name}": ${inspection.factsCount} records across ${
            Object.keys(inspection.brainsBreakdown || {}).length
          } workspace(s), schema v${inspection.schemaVersion}.`,
        });
      } else {
        setBanner({
          type: 'error',
          message:
            inspection.error ||
            `File "${file.name}" failed SQLite integrity verification.`,
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
      setBanner({ type: 'success', message: res.message });
      if (onAfterRestore) onAfterRestore();
    } catch (err: any) {
      setBanner({
        type: 'error',
        message:
          err?.message ||
          'External restore failed. Existing live database was preserved.',
      });
      await loadDatabaseStatus(true);
    } finally {
      setRestoringExternal(false);
    }
  };

  const handleRunMcpSmokeTest = async () => {
    setMcpSmokeRunning(true);
    setMcpSmokeResult(null);
    try {
      const result = await brainStore.runMcpSmokeTest();
      setMcpSmokeResult(result);
      await loadMcpDiagnostics();
    } catch (err: any) {
      setMcpSmokeResult({
        ok: false,
        error: err?.message || 'MCP smoke test failed.',
      });
    } finally {
      setMcpSmokeRunning(false);
    }
  };

  const handleCreateCompanionDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newDeviceName.trim() || 'Chrome Companion';
    setCreatingDevice(true);
    setBanner(null);
    try {
      const res = await brainStore.createCompanionDevice(
        label,
        'Chromium / Manifest V3'
      );
      setIssuedToken({ deviceName: res.device.name, token: res.token });
      setNewDeviceName('');
      await Promise.all([loadCompanionDevices(), loadDatabaseStatus(true)]);
      setBanner({
        type: 'success',
        message: `Paired "${res.device.name}". Copy the one-time token now — only its SHA-256 hash is stored in SQLite.`,
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Failed to pair companion device.',
      });
    } finally {
      setCreatingDevice(false);
    }
  };

  const handleRevokeCompanionDevice = async (device: CompanionDeviceRecord) => {
    setRevokingDeviceId(device.id);
    setBanner(null);
    try {
      await brainStore.revokeCompanionDevice(device.id);
      await Promise.all([loadCompanionDevices(), loadDatabaseStatus(true)]);
      setBanner({
        type: 'success',
        message: `Revoked device token for "${device.name}". Existing Bearer calls are blocked immediately.`,
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err?.message || 'Failed to revoke companion device.',
      });
    } finally {
      setRevokingDeviceId(null);
    }
  };

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {}
  };

  const backups = statusData?.backups || [];
  const verifiedCount = backups.filter((b) => b.verified).length;
  const invalidCount = backups.filter((b) => !b.verified).length;
  const availableBrains =
    statusData?.brains && statusData.brains.length > 0
      ? statusData.brains
      : brainStore.getBrains();
  const activeDevices = companionDevices.filter((d) => !d.revoked_at);
  const revokedDevices = companionDevices.filter((d) => Boolean(d.revoked_at));

  const showSection = (cat: SettingsCategory) =>
    activeCategory === 'all' || activeCategory === cat;

  const currentMeta = SETTINGS_CATEGORIES.find((c) => c.id === activeCategory);

  return (
    <div className="relative h-full w-full overflow-y-auto px-4 py-5 sm:px-6 md:px-8 md:py-7">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Clean Single-Row Top Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            {onBackToWorkspace && (
              <button
                type="button"
                onClick={onBackToWorkspace}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.03] text-white/75 transition hover:border-white/25 hover:text-white"
                title="Return to workspace"
                aria-label="Return to workspace"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-[#9db4ff] shrink-0" />
                <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white truncate">
                  Application Settings
                </h1>
              </div>
              <p className="mt-0.5 text-xs text-white/50 truncate">
                {currentMeta
                  ? currentMeta.description
                  : 'All 7 configuration modules in sequence. Changes persist to local SQLite.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                loadDatabaseStatus(false);
                if (activeCategory === 'connections' || activeCategory === 'all') {
                  loadMcpDiagnostics();
                }
                if (activeCategory === 'companion' || activeCategory === 'all') {
                  loadCompanionDevices();
                }
              }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.08] disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {(activeCategory === 'database' || activeCategory === 'all') && (
              <button
                type="button"
                onClick={handleCreateBackup}
                disabled={creatingBackup || loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-[#04110b] transition hover:bg-emerald-400 disabled:opacity-50 whitespace-nowrap"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>{creatingBackup ? 'Creating…' : 'Create Backup'}</span>
              </button>
            )}
          </div>
        </header>

        {/* Global Feedback Banner */}
        {banner && (
          <div
            role="status"
            className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-xs ${
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
              className="shrink-0 text-white/55 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Clean 2-Pane Settings Layout: Left Rail + Focused Content */}
        <div className="grid grid-cols-1 lg:grid-cols-[268px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
          {/* Left Settings Navigation Rail */}
          <nav
            role="tablist"
            aria-label="Settings Categories"
            data-testid="settings-category-nav"
            className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 lg:sticky lg:top-6 border-b lg:border-b-0 lg:border-r border-white/10 lg:pr-5"
          >
            {SETTINGS_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  data-testid={`settings-tab-${cat.id}`}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setBanner(null);
                  }}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition whitespace-nowrap shrink-0 min-h-[38px] ${
                    isActive
                      ? 'bg-white/[0.09] text-white'
                      : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isActive ? 'text-[#9db4ff]' : 'text-white/40'
                    }`}
                  />
                  <span className="lg:hidden">{cat.shortLabel}</span>
                  <span className="hidden lg:inline">{cat.label}</span>
                </button>
              );
            })}

            <div className="hidden lg:block my-2 border-t border-white/10" />

            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === 'all'}
              data-testid="settings-tab-all"
              onClick={() => {
                setActiveCategory('all');
                setBanner(null);
              }}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition whitespace-nowrap shrink-0 min-h-[38px] ${
                activeCategory === 'all'
                  ? 'bg-white/[0.09] text-white'
                  : 'text-white/50 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <LayoutGrid
                className={`h-3.5 w-3.5 shrink-0 ${
                  activeCategory === 'all' ? 'text-[#9db4ff]' : 'text-white/35'
                }`}
              />
              <span>All Settings</span>
            </button>
          </nav>

          {/* Right Focused Content Area — Strict Sequential Order 1 -> 7 */}
          <div className="min-w-0 space-y-6">
            {/* ===============================================================
                1. GENERAL & APPEARANCE
               =============================================================== */}
            {showSection('general') && (
              <section
                data-testid="general-appearance-settings-panel"
                className="rounded-xl border border-white/10 bg-[#080b14] overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      1. General & Appearance
                    </h2>
                    <p className="mt-0.5 text-xs text-white/50">
                      Workspace startup defaults, table density, and animation preferences.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={savingSettings}
                    onClick={() => {
                      const next: ArgonGlobalSettings = {
                        ...globalSettings,
                        general: { ...DEFAULT_ARGON_SETTINGS.general },
                      };
                      setGlobalSettings(next);
                      handleSaveGlobalSettings(
                        next,
                        'Reset General & Appearance settings to defaults.'
                      );
                    }}
                    className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/[0.08] hover:text-white transition whitespace-nowrap"
                  >
                    Reset Defaults
                  </button>
                </div>

                <div className="divide-y divide-white/[0.07] px-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">
                        Default Memory Brain
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        Workspace selected automatically when Argon launches.
                      </p>
                    </div>
                    <select
                      value={globalSettings.general.defaultWorkspace}
                      onChange={(e) => {
                        const next: ArgonGlobalSettings = {
                          ...globalSettings,
                          general: {
                            ...globalSettings.general,
                            defaultWorkspace: e.target.value,
                          },
                        };
                        setGlobalSettings(next);
                        handleSaveGlobalSettings(
                          next,
                          `Default workspace set to "${e.target.value}".`
                        );
                      }}
                      data-testid="settings-default-workspace-select"
                      className="mono rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-white focus:border-[#9db4ff] focus:outline-none min-w-[180px]"
                    >
                      {availableBrains.map((b) => (
                        <option key={b} value={b} className="bg-[#050711]">
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">
                        Default Workspace View
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        Primary view opened when entering a Memory Brain.
                      </p>
                    </div>
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
                      data-testid="settings-default-view-select"
                      className="mono rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-white focus:border-[#9db4ff] focus:outline-none min-w-[180px]"
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
                      <option value="activity" className="bg-[#050711]">
                        Activity Log
                      </option>
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">
                        Default Graph Layout
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        Spatial arrangement used when opening the Neural Graph.
                      </p>
                    </div>
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
                      data-testid="settings-default-graph-layout-select"
                      className="mono rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-white focus:border-[#9db4ff] focus:outline-none min-w-[180px]"
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

                  <div className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">
                        Compact Memory Table Density
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        Reduces row padding in the Memory Table to fit more records per viewport.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={globalSettings.general.compactTableDensity}
                      onChange={(checked) => {
                        const next: ArgonGlobalSettings = {
                          ...globalSettings,
                          general: {
                            ...globalSettings.general,
                            compactTableDensity: checked,
                          },
                        };
                        setGlobalSettings(next);
                        handleSaveGlobalSettings(
                          next,
                          `Compact table density ${checked ? 'enabled' : 'disabled'}.`
                        );
                      }}
                      ariaLabel="Compact Memory Table Density"
                      testId="settings-compact-table-toggle"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">
                        Reduced Motion
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        Minimizes non-essential transitions and canvas motion across the interface.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={globalSettings.general.reducedMotion}
                      onChange={(checked) => {
                        const next: ArgonGlobalSettings = {
                          ...globalSettings,
                          general: {
                            ...globalSettings.general,
                            reducedMotion: checked,
                          },
                        };
                        setGlobalSettings(next);
                        handleSaveGlobalSettings(
                          next,
                          `Reduced motion ${checked ? 'enabled' : 'disabled'}.`
                        );
                      }}
                      ariaLabel="Reduced Motion"
                      testId="settings-reduced-motion-toggle"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* ===============================================================
                2. DATABASE & BACKUPS (Strictly gated by showSection('database'))
               =============================================================== */}
            {showSection('database') && (
              <div className="space-y-6">
                {/* 2A. Live SQLite Summary Strip */}
                <section className="rounded-xl border border-white/10 bg-[#080b14] overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                    <div>
                      <h2 className="text-sm font-semibold text-white">
                        2. Database & Backups
                      </h2>
                      <p className="mt-0.5 text-xs text-white/50">
                        Local SQLite storage status, automatic snapshot scheduling, and recovery.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`mono text-[11px] font-medium ${
                          statusData?.status === 'healthy'
                            ? 'text-emerald-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {statusData?.status === 'healthy'
                          ? 'PRAGMA integrity_check = ok'
                          : 'Checking integrity…'}
                      </span>
                    </div>
                  </div>

                  <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.07] text-xs">
                    <div className="p-4">
                      <dt className="text-[11px] text-white/50">Database Path</dt>
                      <dd className="mono mt-1 text-white/90 truncate" title={statusData?.dbLocation}>
                        {statusData?.dbLocation || 'data/brain.db'}
                      </dd>
                    </div>
                    <div className="p-4">
                      <dt className="text-[11px] text-white/50">Engine & Journal</dt>
                      <dd className="mono mt-1 text-white/90">
                        {statusData
                          ? `${statusData.engine} · ${statusData.journalMode.toUpperCase()}`
                          : 'node:sqlite · WAL'}
                      </dd>
                    </div>
                    <div className="p-4">
                      <dt className="text-[11px] text-white/50">Records & Brains</dt>
                      <dd className="mono mt-1 text-white/90 tabular-nums">
                        {statusData?.factsCount ?? 0} facts · {statusData?.brainsCount ?? 0} brains
                      </dd>
                    </div>
                    <div className="p-4">
                      <dt className="text-[11px] text-white/50">Size & Schema</dt>
                      <dd className="mono mt-1 text-white/90 tabular-nums">
                        {formatByteSize(statusData?.dbSizeBytes || 0)} · v
                        {statusData?.schemaVersion ?? 5}
                      </dd>
                    </div>
                  </dl>
                </section>

                {/* 2B. Unified Auto-Backup Scheduler & Retention Policy */}
                <section
                  data-testid="auto-backup-scheduler-panel"
                  className="rounded-xl border border-white/10 bg-[#080b14] overflow-hidden"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Clock className="h-4 w-4 text-emerald-400" />
                        <span>Automatic Backup Schedule & Retention</span>
                      </h3>
                      <p className="mt-0.5 text-xs text-white/50">
                        Non-destructive <code className="mono text-white/75">VACUUM INTO</code> snapshots verified with SQLite integrity checks.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunAutoBackupCheckNow}
                      disabled={runningScheduledCheck}
                      data-testid="run-scheduled-backup-now-btn"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50 transition whitespace-nowrap"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${
                          runningScheduledCheck ? 'animate-spin' : ''
                        }`}
                      />
                      <span>
                        {runningScheduledCheck
                          ? 'Running Snapshot…'
                          : 'Run Scheduled Snapshot Now'}
                      </span>
                    </button>
                  </div>

                  <div className="divide-y divide-white/[0.07] px-5">
                    <div className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-white">
                          Enable Automatic Backups
                        </div>
                        <p className="mt-0.5 text-xs text-white/50">
                          {globalSettings.autoBackup.enabled
                            ? 'Background scheduler runs verified snapshots on the configured interval.'
                            : 'Scheduled snapshots paused. Manual and pre-restore backups remain active.'}
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={globalSettings.autoBackup.enabled}
                        onChange={(checked) => {
                          const next: ArgonGlobalSettings = {
                            ...globalSettings,
                            autoBackup: {
                              ...globalSettings.autoBackup,
                              enabled: checked,
                            },
                          };
                          setGlobalSettings(next);
                          handleSaveGlobalSettings(
                            next,
                            `Automatic scheduled backups ${checked ? 'enabled' : 'disabled'}.`
                          );
                        }}
                        ariaLabel="Enable Automatic Backups"
                        testId="auto-backup-enabled-toggle"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-white">
                          Schedule Frequency
                        </div>
                        <p className="mt-0.5 mono text-[11px] text-white/50 tabular-nums">
                          Last:{' '}
                          {formatTimestamp(
                            statusData?.autoBackup?.lastBackupAt ||
                              globalSettings.autoBackup.lastBackupAt
                          )}{' '}
                          · Next:{' '}
                          <span className="text-emerald-300">
                            {globalSettings.autoBackup.enabled
                              ? formatTimestamp(
                                  statusData?.autoBackup?.nextScheduledBackupAt ||
                                    globalSettings.autoBackup.nextScheduledBackupAt
                                )
                              : 'Paused'}
                          </span>
                        </p>
                      </div>
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
                            `Scheduled backup frequency set to ${nextFreq}.`
                          );
                        }}
                        data-testid="auto-backup-frequency-select"
                        className="mono rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-white focus:border-[#9db4ff] focus:outline-none min-w-[210px]"
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

                    <form
                      onSubmit={handleApplyRetention}
                      className="flex flex-wrap items-center justify-between gap-4 py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <label
                          htmlFor="backup-retention-input"
                          className="block text-xs font-medium text-white"
                        >
                          Retention Limit (1–100 Verified Backups)
                        </label>
                        <p className="mt-0.5 text-xs text-white/50">
                          Stored in{' '}
                          <code className="mono text-white/75">
                            {statusData?.backupLocation || 'data/backups/'}
                          </code>
                          . Never prunes the last known-good snapshot.
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
                          className="mono w-20 rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-white tabular-nums focus:border-[#9db4ff] focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={savingRetention || loading}
                          className="rounded-lg border border-white/15 bg-white/[0.06] px-3.5 py-2 text-xs font-medium text-white hover:bg-white/[0.12] transition disabled:opacity-50 whitespace-nowrap"
                        >
                          {savingRetention ? 'Applying…' : 'Apply Retention'}
                        </button>
                      </div>
                    </form>

                    {(statusData?.autoBackup?.lastBackupError ||
                      globalSettings.autoBackup.lastBackupError) && (
                      <div className="py-3 text-xs text-rose-300 flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Last scheduler error:{' '}
                          {statusData?.autoBackup?.lastBackupError ||
                            globalSettings.autoBackup.lastBackupError}
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                {/* 2C. Stored SQLite Snapshots & External .db Restore */}
                <section className="rounded-xl border border-white/10 bg-[#080b14] overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Stored Snapshots ({backups.length})
                      </h3>
                      <p className="mt-0.5 mono text-[11px] text-white/50 tabular-nums">
                        {verifiedCount} verified · {invalidCount} invalid
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {invalidCount > 0 && (
                        <button
                          type="button"
                          disabled={cleaningInvalid}
                          onClick={handleCleanupInvalidBackups}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-50 transition whitespace-nowrap"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>
                            {cleaningInvalid
                              ? 'Cleaning…'
                              : `Delete Invalid (${invalidCount})`}
                          </span>
                        </button>
                      )}

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
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.1] transition whitespace-nowrap"
                      >
                        <Upload className="h-3.5 w-3.5 text-[#9db4ff]" />
                        <span>
                          {inspectingExternal
                            ? 'Inspecting .db…'
                            : 'Verify / Restore External .db'}
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* External Backup Inspection Result */}
                  {externalInspection && (
                    <div
                      className={`border-b border-white/10 px-5 py-4 text-xs space-y-3 ${
                        externalInspection.valid
                          ? 'bg-emerald-500/[0.05]'
                          : 'bg-rose-500/[0.06]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <FileCheck2
                            className={`h-4 w-4 ${
                              externalInspection.valid
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          />
                          <span className="mono font-semibold text-white">
                            {externalInspection.fileName}
                          </span>
                          <span className="mono text-[11px] text-white/50 tabular-nums">
                            ({formatByteSize(externalInspection.sizeBytes)})
                          </span>
                        </div>
                        <span
                          className={`mono text-[11px] font-medium ${
                            externalInspection.valid
                              ? 'text-emerald-300'
                              : 'text-rose-300'
                          }`}
                        >
                          {externalInspection.valid
                            ? `Verified · ${externalInspection.factsCount} facts · Schema v${externalInspection.schemaVersion}`
                            : `Invalid (${externalInspection.integrityStatus})`}
                        </span>
                      </div>

                      {externalInspection.valid ? (
                        !confirmExternalRestore ? (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-white/65">
                              Workspaces:{' '}
                              {Object.entries(
                                externalInspection.brainsBreakdown || {}
                              )
                                .map(([b, c]) => `${b} (${c})`)
                                .join(', ') || 'None'}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setConfirmExternalRestore(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300 transition"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>Restore This File…</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setExternalFile(null);
                                  setExternalInspection(null);
                                  if (fileInputRef.current)
                                    fileInputRef.current.value = '';
                                }}
                                className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/75 hover:text-white"
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3.5 space-y-2.5">
                            <p className="text-white/85 leading-relaxed">
                              Argon will first save a{' '}
                              <strong className="text-white">
                                Pre-Restore Safety Backup
                              </strong>{' '}
                              of your current database ({statusData?.factsCount ?? 0}{' '}
                              facts), then replace it with{' '}
                              <code className="mono text-amber-200">
                                {externalInspection.fileName}
                              </code>{' '}
                              ({externalInspection.factsCount} facts).
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={restoringExternal}
                                onClick={handleRestoreExternalFile}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>
                                  {restoringExternal
                                    ? 'Restoring…'
                                    : 'Confirm & Restore'}
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
                        )
                      ) : (
                        <p className="text-rose-200">
                          {externalInspection.error ||
                            'Selected file is not a valid SQLite database.'}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Inline Confirm Restore Dialog */}
                  {confirmRestoreTarget && (
                    <div className="border-b border-amber-500/30 bg-amber-500/[0.07] px-5 py-4 space-y-2.5 text-xs">
                      <div className="font-semibold text-white">
                        Restore database from{' '}
                        <span className="mono text-amber-300">
                          {confirmRestoreTarget.fileName}
                        </span>
                        ?
                      </div>
                      <p className="text-white/75 leading-relaxed">
                        Argon will save a Pre-Restore Safety Backup of your current database first and automatically roll back if verification fails.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={restoringFileName !== null}
                          onClick={() => handleConfirmRestore(confirmRestoreTarget)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>
                            {restoringFileName === confirmRestoreTarget.fileName
                              ? 'Restoring…'
                              : 'Confirm & Restore'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={restoringFileName !== null}
                          onClick={() => setConfirmRestoreTarget(null)}
                          className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/80 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline Confirm Delete Dialog */}
                  {confirmDeleteTarget && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-500/30 bg-rose-500/[0.08] px-5 py-3.5 text-xs">
                      <span className="text-rose-200">
                        Permanently delete{' '}
                        <strong className="mono text-white">
                          {confirmDeleteTarget.fileName}
                        </strong>
                        ?
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={deletingFileName !== null}
                          onClick={() => handleDeleteBackup(confirmDeleteTarget)}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
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
                  )}

                  {/* Snapshots List */}
                  {loading ? (
                    <div className="px-5 py-8 text-center text-xs text-white/50">
                      Verifying SQLite snapshots…
                    </div>
                  ) : backups.length === 0 ? (
                    <div className="px-5 py-8 text-center text-xs text-white/55">
                      No snapshots yet. Click &ldquo;Create Backup&rdquo; above to capture your first verified SQLite snapshot.
                    </div>
                  ) : (
                    <div className="divide-y divide-white/[0.06]">
                      {backups.map((backup) => {
                        const kindMeta = formatBackupKindText(backup.kind);
                        const isRestoringThis =
                          restoringFileName === backup.fileName;
                        const isExportingThis =
                          exportingFileName === backup.fileName;
                        const isLastKnownGood =
                          backup.verified && verifiedCount <= 1;

                        return (
                          <div
                            key={backup.fileName}
                            className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="mono truncate font-medium text-white">
                                  {backup.fileName}
                                </span>
                                <span className="text-white/25" aria-hidden="true">
                                  ·
                                </span>
                                <span className={`text-[11px] font-medium ${kindMeta.colorClass}`}>
                                  {kindMeta.label}
                                </span>
                                <span className="text-white/25" aria-hidden="true">
                                  ·
                                </span>
                                {backup.verified ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
                                    <ShieldCheck className="h-3 w-3" />
                                    Verified
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-rose-300">
                                    <AlertTriangle className="h-3 w-3" />
                                    Invalid ({backup.integrityStatus})
                                  </span>
                                )}
                              </div>
                              <div className="mono flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-white/45 tabular-nums">
                                <span>{formatTimestamp(backup.createdAt)}</span>
                                <span aria-hidden="true">·</span>
                                <span>{formatByteSize(backup.sizeBytes)}</span>
                                <span aria-hidden="true">·</span>
                                <span>Schema v{backup.schemaVersion}</span>
                                <span aria-hidden="true">·</span>
                                <span>{backup.factsCount} facts</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleDownloadBackup(backup)}
                                disabled={!backup.verified || isExportingThis}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/85 hover:bg-white/[0.09] disabled:opacity-35 transition whitespace-nowrap"
                              >
                                <Download className="h-3.5 w-3.5" />
                                <span>{isExportingThis ? 'Exporting…' : 'Export .db'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRestoreTarget(backup)}
                                disabled={!backup.verified || isRestoringThis}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-35 transition whitespace-nowrap"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>{isRestoringThis ? 'Restoring…' : 'Restore'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTarget(backup)}
                                disabled={isLastKnownGood}
                                title={
                                  isLastKnownGood
                                    ? 'Protected: cannot delete the last verified backup'
                                    : `Delete ${backup.fileName}`
                                }
                                aria-label={`Delete ${backup.fileName}`}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/[0.03] text-white/55 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-30 transition"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* 2D. Portable Brain Format Family */}
                <SecurityAndPortableSection
                  availableBrains={availableBrains}
                  showPortable={true}
                  showSecurity={false}
                  onDataImported={() => {
                    loadDatabaseStatus(true);
                    if (onAfterRestore) onAfterRestore();
                  }}
                />
              </div>
            )}

            {/* ===============================================================
                3. MEMORY & INTELLIGENCE
               =============================================================== */}
            {showSection('memory') && (
              <section
                data-testid="memory-intelligence-settings-panel"
                className="rounded-xl border border-white/10 bg-[#080b14] overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      3. Memory & Intelligence
                    </h2>
                    <p className="mt-0.5 text-xs text-white/50">
                      Control provenance attribution, semantic linking, tag confidence, and export formatting.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={savingSettings}
                    onClick={() => {
                      const next: ArgonGlobalSettings = {
                        ...globalSettings,
                        memoryIntelligence: {
                          ...DEFAULT_ARGON_SETTINGS.memoryIntelligence,
                        },
                      };
                      setGlobalSettings(next);
                      handleSaveGlobalSettings(
                        next,
                        'Reset Memory & Intelligence settings to defaults.'
                      );
                    }}
                    className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/[0.08] hover:text-white transition whitespace-nowrap"
                  >
                    Reset Defaults
                  </button>
                </div>

                <div className="divide-y divide-white/[0.07] px-5">
                  <div className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">
                        Auto-Extract Metadata & Tags
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        Automatically derive titles, timestamps, and topic tags when ingesting documents.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={globalSettings.memoryIntelligence.autoExtractMetadata}
                      onChange={(checked) => {
                        const next: ArgonGlobalSettings = {
                          ...globalSettings,
                          memoryIntelligence: {
                            ...globalSettings.memoryIntelligence,
                            autoExtractMetadata: checked,
                          },
                        };
                        setGlobalSettings(next);
                        handleSaveGlobalSettings(next);
                      }}
                      ariaLabel="Auto-Extract Metadata & Tags"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">
                        Strict Folder Provenance
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        Prioritize folder names (e.g. <code className="mono text-white/75">01_claude</code>, <code className="mono text-white/75">07_local_ai_ollama</code>) over body text heuristics.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={globalSettings.memoryIntelligence.strictFolderProvenance}
                      onChange={(checked) => {
                        const next: ArgonGlobalSettings = {
                          ...globalSettings,
                          memoryIntelligence: {
                            ...globalSettings.memoryIntelligence,
                            strictFolderProvenance: checked,
                          },
                        };
                        setGlobalSettings(next);
                        handleSaveGlobalSettings(next);
                      }}
                      ariaLabel="Strict Folder Provenance"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">
                        Semantic Relationships & Section Diffing
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        Compute cross-source semantic edges in the Neural Graph and diff modified imports by section.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={
                        globalSettings.memoryIntelligence
                          .enableSemanticRelationships
                      }
                      onChange={(checked) => {
                        const next: ArgonGlobalSettings = {
                          ...globalSettings,
                          memoryIntelligence: {
                            ...globalSettings.memoryIntelligence,
                            enableSemanticRelationships: checked,
                          },
                        };
                        setGlobalSettings(next);
                        handleSaveGlobalSettings(next);
                      }}
                      ariaLabel="Semantic Relationships & Section Diffing"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">
                        Minimum Tag Confidence
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        Higher thresholds reduce noisy tags during bulk document imports.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0.4}
                        max={0.95}
                        step={0.05}
                        value={globalSettings.memoryIntelligence.minTagConfidence}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          const next: ArgonGlobalSettings = {
                            ...globalSettings,
                            memoryIntelligence: {
                              ...globalSettings.memoryIntelligence,
                              minTagConfidence: val,
                            },
                          };
                          setGlobalSettings(next);
                          handleSaveGlobalSettings(
                            next,
                            `Minimum tag confidence updated to ${Math.round(val * 100)}%.`
                          );
                        }}
                        aria-label="Minimum Tag Confidence"
                        className="w-28 accent-[#9db4ff]"
                      />
                      <span className="mono w-10 text-right text-xs text-white tabular-nums">
                        {Math.round(
                          globalSettings.memoryIntelligence.minTagConfidence * 100
                        )}
                        %
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">
                        Include Metadata in Markdown Exports
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        Attach source, timestamp, file path, and tags to exported Markdown documents.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={
                        globalSettings.memoryIntelligence
                          .defaultExportIncludeMetadata
                      }
                      onChange={(checked) => {
                        const next: ArgonGlobalSettings = {
                          ...globalSettings,
                          memoryIntelligence: {
                            ...globalSettings.memoryIntelligence,
                            defaultExportIncludeMetadata: checked,
                          },
                        };
                        setGlobalSettings(next);
                        handleSaveGlobalSettings(next);
                      }}
                      ariaLabel="Include Metadata in Markdown Exports"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">
                        Group Markdown Exports by AI Source
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        Organize exported memory snapshots into sections per AI source.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={
                        globalSettings.memoryIntelligence
                          .defaultExportGroupBySource
                      }
                      onChange={(checked) => {
                        const next: ArgonGlobalSettings = {
                          ...globalSettings,
                          memoryIntelligence: {
                            ...globalSettings.memoryIntelligence,
                            defaultExportGroupBySource: checked,
                          },
                        };
                        setGlobalSettings(next);
                        handleSaveGlobalSettings(next);
                      }}
                      ariaLabel="Group Markdown Exports by AI Source"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* ===============================================================
                4. IMPORT & PROCESSING
               =============================================================== */}
            {showSection('import') && (
              <section
                data-testid="import-processing-settings-panel"
                className="rounded-xl border border-white/10 bg-[#080b14] overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      4. Import & Processing
                    </h2>
                    <p className="mt-0.5 text-xs text-white/50">
                      Batch limits (1–5,000 files), worker concurrency, ingestion strategy, duplicate handling, and retries.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {importDirty && (
                      <span className="text-[11px] font-medium text-amber-300">
                        Unsaved changes
                      </span>
                    )}
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
                          'Reset Import & Processing settings to defaults (1,000 files/batch, concurrency 3).'
                        );
                      }}
                      className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/[0.08] hover:text-white transition whitespace-nowrap"
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
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#9db4ff] px-3.5 py-1.5 text-xs font-semibold text-[#050712] hover:bg-white disabled:opacity-50 transition whitespace-nowrap"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>{savingSettings ? 'Saving…' : 'Save Changes'}</span>
                    </button>
                  </div>
                </div>

                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <label className="space-y-1.5">
                      <span className="block font-medium text-white">
                        Maximum Files per Batch (1–5,000)
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={5000}
                        value={globalSettings.importProcessing.maxFilesPerBatch}
                        onChange={(e) => {
                          setImportDirty(true);
                          setGlobalSettings((prev) => ({
                            ...prev,
                            importProcessing: {
                              ...prev.importProcessing,
                              maxFilesPerBatch: Math.max(
                                1,
                                Math.min(5000, parseInt(e.target.value, 10) || 1000)
                              ),
                            },
                          }));
                        }}
                        data-testid="settings-max-files-per-batch-input"
                        className="mono w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-white tabular-nums focus:border-[#9db4ff] focus:outline-none"
                      />
                      <span className="block text-[11px] text-white/45">
                        Applies to direct drops and multi-folder ZIP extraction. Default: 1,000.
                      </span>
                    </label>

                    <label className="space-y-1.5">
                      <span className="block font-medium text-white">
                        Processing Concurrency
                      </span>
                      <select
                        value={globalSettings.importProcessing.concurrency}
                        onChange={(e) => {
                          setImportDirty(true);
                          setGlobalSettings((prev) => ({
                            ...prev,
                            importProcessing: {
                              ...prev.importProcessing,
                              concurrency: parseInt(e.target.value, 10) || 3,
                            },
                          }));
                        }}
                        data-testid="settings-concurrency-select"
                        className="mono w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-white focus:border-[#9db4ff] focus:outline-none"
                      >
                        <option value={1} className="bg-[#050711]">
                          1 — Sequential (lowest memory)
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
                          10 — Maximum
                        </option>
                      </select>
                      <span className="block text-[11px] text-white/45">
                        Parallel worker count during Review Queue persistence.
                      </span>
                    </label>

                    <label className="space-y-1.5">
                      <span className="block font-medium text-white">
                        Default Ingestion Strategy
                      </span>
                      <select
                        value={globalSettings.importProcessing.defaultStrategy}
                        onChange={(e) => {
                          setImportDirty(true);
                          setGlobalSettings((prev) => ({
                            ...prev,
                            importProcessing: {
                              ...prev.importProcessing,
                              defaultStrategy: e.target.value as IngestStrategy,
                            },
                          }));
                        }}
                        data-testid="settings-default-strategy-select"
                        className="mono w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-white focus:border-[#9db4ff] focus:outline-none"
                      >
                        <option value="semantic" className="bg-[#050711]">
                          Unified (1 semantic node per file)
                        </option>
                        <option value="branching" className="bg-[#050711]">
                          Branching (Document hub + child sections)
                        </option>
                        <option value="chunk" className="bg-[#050711]">
                          Sliced (Fixed character chunks)
                        </option>
                      </select>
                      <span className="block text-[11px] text-white/45">
                        Can still be overridden per batch inside Capture Hub.
                      </span>
                    </label>

                    <label className="space-y-1.5">
                      <span className="block font-medium text-white">
                        Default Destination Brain
                      </span>
                      <select
                        value={globalSettings.importProcessing.defaultBrain}
                        onChange={(e) => {
                          setImportDirty(true);
                          setGlobalSettings((prev) => ({
                            ...prev,
                            importProcessing: {
                              ...prev.importProcessing,
                              defaultBrain: e.target.value,
                            },
                          }));
                        }}
                        data-testid="settings-default-brain-select"
                        className="mono w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-white focus:border-[#9db4ff] focus:outline-none"
                      >
                        {availableBrains.map((b) => (
                          <option key={b} value={b} className="bg-[#050711]">
                            {b}
                          </option>
                        ))}
                      </select>
                      <span className="block text-[11px] text-white/45">
                        Fallback workspace when staging new captures or files.
                      </span>
                    </label>

                    <label className="space-y-1.5">
                      <span className="block font-medium text-white">
                        Default Duplicate Policy
                      </span>
                      <select
                        value={globalSettings.importProcessing.defaultDuplicatePolicy}
                        onChange={(e) => {
                          setImportDirty(true);
                          setGlobalSettings((prev) => ({
                            ...prev,
                            importProcessing: {
                              ...prev.importProcessing,
                              defaultDuplicatePolicy: e.target
                                .value as DuplicateHandlingPolicy,
                            },
                          }));
                        }}
                        data-testid="settings-duplicate-policy-select"
                        className="mono w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-white focus:border-[#9db4ff] focus:outline-none"
                      >
                        <option value="skip" className="bg-[#050711]">
                          Skip duplicates (Safest)
                        </option>
                        <option value="ask_user" className="bg-[#050711]">
                          Ask per modified item
                        </option>
                        <option value="merge" className="bg-[#050711]">
                          Merge modified files
                        </option>
                        <option value="replace" className="bg-[#050711]">
                          Replace existing node
                        </option>
                      </select>
                      <span className="block text-[11px] text-white/45">
                        Exact checksum matches are skipped automatically.
                      </span>
                    </label>

                    <div className="space-y-1.5">
                      <span className="block font-medium text-white">
                        Failed-Item Retry Policy & Max Retries
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          value={globalSettings.importProcessing.failedRetryBehaviour}
                          onChange={(e) => {
                            setImportDirty(true);
                            setGlobalSettings((prev) => ({
                              ...prev,
                              importProcessing: {
                                ...prev.importProcessing,
                                failedRetryBehaviour: e.target
                                  .value as FailedRetryBehaviour,
                              },
                            }));
                          }}
                          data-testid="settings-retry-behaviour-select"
                          className="mono flex-1 rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-white focus:border-[#9db4ff] focus:outline-none"
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
                          onChange={(e) => {
                            setImportDirty(true);
                            setGlobalSettings((prev) => ({
                              ...prev,
                              importProcessing: {
                                ...prev.importProcessing,
                                maxRetries: Math.max(
                                  0,
                                  Math.min(5, parseInt(e.target.value, 10) || 0)
                                ),
                              },
                            }));
                          }}
                          aria-label="Maximum retry attempts"
                          className="mono w-16 rounded-lg border border-white/15 bg-black/60 px-2.5 py-2 text-xs text-white tabular-nums focus:border-[#9db4ff] focus:outline-none"
                        />
                      </div>
                      <span className="block text-[11px] text-white/45">
                        Failed multi-node writes roll back atomically.
                      </span>
                    </div>
                  </div>

                  {/* Safety & Verification Toggles */}
                  <div className="border-t border-white/10 pt-2 divide-y divide-white/[0.06]">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <span className="text-xs text-white/85">
                        Duplicate detection enabled
                      </span>
                      <ToggleSwitch
                        checked={
                          globalSettings.importProcessing
                            .duplicateDetectionEnabled
                        }
                        onChange={(checked) => {
                          setImportDirty(true);
                          setGlobalSettings((prev) => ({
                            ...prev,
                            importProcessing: {
                              ...prev.importProcessing,
                              duplicateDetectionEnabled: checked,
                            },
                          }));
                        }}
                        ariaLabel="Duplicate detection enabled"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <span className="text-xs text-white/85">
                        Automatic post-import integrity verification
                      </span>
                      <ToggleSwitch
                        checked={
                          globalSettings.importProcessing.autoVerifyAfterImport
                        }
                        onChange={(checked) => {
                          setImportDirty(true);
                          setGlobalSettings((prev) => ({
                            ...prev,
                            importProcessing: {
                              ...prev.importProcessing,
                              autoVerifyAfterImport: checked,
                            },
                          }));
                        }}
                        ariaLabel="Automatic post-import integrity verification"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <span className="text-xs text-white/85">
                        Show import completion notifications
                      </span>
                      <ToggleSwitch
                        checked={
                          globalSettings.importProcessing.showNotifications
                        }
                        onChange={(checked) => {
                          setImportDirty(true);
                          setGlobalSettings((prev) => ({
                            ...prev,
                            importProcessing: {
                              ...prev.importProcessing,
                              showNotifications: checked,
                            },
                          }));
                        }}
                        ariaLabel="Show import completion notifications"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4 py-3">
                      <div className="flex items-center gap-2 text-xs text-white/85">
                        <span>Auto-backup after large imports (≥</span>
                        <input
                          type="number"
                          min={5}
                          max={2000}
                          value={
                            globalSettings.importProcessing
                              .largeImportBackupThreshold
                          }
                          onChange={(e) => {
                            setImportDirty(true);
                            setGlobalSettings((prev) => ({
                              ...prev,
                              importProcessing: {
                                ...prev.importProcessing,
                                largeImportBackupThreshold: Math.max(
                                  5,
                                  Math.min(
                                    2000,
                                    parseInt(e.target.value, 10) || 50
                                  )
                                ),
                              },
                            }));
                          }}
                          aria-label="Large import backup threshold"
                          className="mono w-16 rounded border border-white/15 bg-black/60 px-2 py-0.5 text-xs text-white tabular-nums focus:border-[#9db4ff] focus:outline-none"
                        />
                        <span>files)</span>
                      </div>
                      <ToggleSwitch
                        checked={
                          globalSettings.importProcessing
                            .autoBackupAfterLargeImport
                        }
                        onChange={(checked) => {
                          setImportDirty(true);
                          setGlobalSettings((prev) => ({
                            ...prev,
                            importProcessing: {
                              ...prev.importProcessing,
                              autoBackupAfterLargeImport: checked,
                            },
                          }));
                        }}
                        ariaLabel="Auto-backup after large imports"
                      />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ===============================================================
                5. AI CONNECTIONS & MCP BRIDGE
               =============================================================== */}
            {showSection('connections') && (
              <section
                data-testid="ai-connections-settings-panel"
                className="rounded-xl border border-white/10 bg-[#080b14] overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      5. AI Connections
                    </h2>
                    <p className="mt-0.5 text-xs text-white/50">
                      Node.js stdio MCP server, local HTTP JSON-RPC bridge, and AI recall controls.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRunMcpSmokeTest}
                      disabled={mcpSmokeRunning}
                      data-testid="settings-mcp-smoke-btn"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50 transition whitespace-nowrap"
                    >
                      <Play className="h-3 w-3" />
                      <span>
                        {mcpSmokeRunning ? 'Testing…' : 'Run MCP Smoke Test'}
                      </span>
                    </button>
                    {onOpenMcpBridge && (
                      <button
                        type="button"
                        data-testid="open-mcp-bridge-settings-btn"
                        onClick={onOpenMcpBridge}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#9db4ff] px-3.5 py-1.5 text-xs font-semibold text-[#050712] hover:bg-white transition whitespace-nowrap"
                      >
                        <span>Open MCP Bridge & Configs</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-white/[0.07] px-5">
                  <div className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">
                        Enable Local MCP Bridge
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        Expose local tools (<code className="mono text-white/75">list_brains</code>, <code className="mono text-white/75">search_memories</code>, <code className="mono text-white/75">remember_fact</code>) over stdio and localhost HTTP.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={globalSettings.aiConnections.mcpBridgeEnabled}
                      onChange={(checked) => {
                        const next: ArgonGlobalSettings = {
                          ...globalSettings,
                          aiConnections: {
                            ...globalSettings.aiConnections,
                            mcpBridgeEnabled: checked,
                          },
                        };
                        setGlobalSettings(next);
                        handleSaveGlobalSettings(
                          next,
                          `Local MCP Bridge ${checked ? 'enabled' : 'disabled'}.`
                        );
                      }}
                      ariaLabel="Enable Local MCP Bridge"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white">
                        Default Recall Limit
                      </div>
                      <p className="mt-0.5 text-xs text-white/50">
                        Maximum number of memory records returned per AI recall query (25–1,000).
                      </p>
                    </div>
                    <input
                      type="number"
                      min={25}
                      max={1000}
                      step={25}
                      value={globalSettings.aiConnections.defaultRecallLimit}
                      onChange={(e) => {
                        const val = Math.max(
                          25,
                          Math.min(1000, parseInt(e.target.value, 10) || 250)
                        );
                        const next: ArgonGlobalSettings = {
                          ...globalSettings,
                          aiConnections: {
                            ...globalSettings.aiConnections,
                            defaultRecallLimit: val,
                          },
                        };
                        setGlobalSettings(next);
                        handleSaveGlobalSettings(
                          next,
                          `Default AI recall limit set to ${val} facts.`
                        );
                      }}
                      aria-label="Default Recall Limit"
                      className="mono w-24 rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-white tabular-nums focus:border-[#9db4ff] focus:outline-none"
                    />
                  </div>

                  {/* Live Transport Readout */}
                  <div className="py-4 space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-white/55">Desktop stdio MCP Runtime</span>
                      <span className="mono text-emerald-300">
                        {mcpLoading
                          ? 'Checking…'
                          : mcpDiagnostics?.transports?.desktopStdio?.status === 'ready'
                            ? 'Ready · Node.js · scripts/mcp-server.ts'
                            : 'Node.js · scripts/mcp-server.ts (JSON-RPC 2.0)'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-white/55">Local HTTP Gateway</span>
                      <span className="mono text-emerald-300">
                        {mcpDiagnostics?.transports?.localHttpApi?.endpoints?.mcp ||
                          'http://127.0.0.1:3000/api/mcp'}{' '}
                        (Strict Loopback)
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-white/55">Supported AI Sources</span>
                      <span className="mono text-white/80">
                        Claude · ChatGPT · Gemini · Cursor · GitHub · Ollama · Moodle
                      </span>
                    </div>

                    {mcpSmokeResult && (
                      <div
                        data-testid="settings-mcp-smoke-result"
                        className={`mt-2 rounded-lg border px-3.5 py-2.5 text-xs space-y-1.5 ${
                          mcpSmokeResult.ok
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                            : 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                        }`}
                      >
                        <div className="font-semibold">
                          {mcpSmokeResult.ok
                            ? `MCP Smoke Test Passed (${mcpSmokeResult.durationMs ?? 0}ms)`
                            : mcpSmokeResult.error || 'MCP smoke test failed.'}
                        </div>
                        {Array.isArray(mcpSmokeResult.steps) && (
                          <ul className="space-y-0.5 text-[11px] text-white/80 mono">
                            {mcpSmokeResult.steps.map((s: any) => (
                              <li key={s.step}>
                                {s.ok ? '✓' : '✗'} {s.step}: {s.detail}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ===============================================================
                6. BROWSER COMPANION & DEVICES
               =============================================================== */}
            {showSection('companion') && (
              <section
                data-testid="browser-companion-settings-panel"
                className="rounded-xl border border-white/10 bg-[#080b14] overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      6. Browser Companion & Devices
                    </h2>
                    <p className="mt-0.5 text-xs text-white/50">
                      Pair your Manifest V3 extension (<code className="mono text-white/75">/extension</code>) with SHA-256 hashed Bearer tokens.
                    </p>
                  </div>
                  {onOpenCompanion && (
                    <button
                      type="button"
                      onClick={onOpenCompanion}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-white/[0.1] transition whitespace-nowrap"
                    >
                      <span>Open Companion Setup</span>
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="p-5 space-y-5">
                  {/* Inline Pair New Device Form */}
                  <form
                    onSubmit={handleCreateCompanionDevice}
                    className="flex flex-wrap items-center gap-2.5"
                  >
                    <input
                      type="text"
                      value={newDeviceName}
                      onChange={(e) => setNewDeviceName(e.target.value)}
                      placeholder="New device label (e.g. MacBook Chrome)"
                      aria-label="New companion device label"
                      className="flex-1 min-w-[200px] rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs text-white placeholder:text-white/35 focus:border-[#9db4ff] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={creatingDevice}
                      data-testid="settings-pair-device-btn"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#9db4ff] px-3.5 py-2 text-xs font-semibold text-[#050712] hover:bg-white disabled:opacity-50 transition whitespace-nowrap"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{creatingDevice ? 'Pairing…' : 'Generate Device Token'}</span>
                    </button>
                  </form>

                  {/* One-Time Issued Token Reveal */}
                  {issuedToken && (
                    <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-emerald-200">
                          One-Time Token for {issuedToken.deviceName}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIssuedToken(null)}
                          className="text-white/55 hover:text-white text-[11px]"
                        >
                          Hide
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="mono flex-1 overflow-x-auto rounded border border-white/10 bg-black/60 px-3 py-2 text-[11px] text-emerald-300">
                          {issuedToken.token}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopyToken(issuedToken.token)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.08] px-3 py-2 text-xs font-medium text-white hover:bg-white/[0.14] whitespace-nowrap"
                        >
                          {copiedToken ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-300" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-white/60">
                        Paste this token into the Browser Companion extension popup targeting <code className="mono text-white/80">http://127.0.0.1:3000</code>. It will not be shown again.
                      </p>
                    </div>
                  )}

                  {/* Active Paired Devices Table */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-white">
                        Paired Devices ({activeDevices.length} active
                        {revokedDevices.length > 0
                          ? ` · ${revokedDevices.length} revoked`
                          : ''}
                        )
                      </span>
                      <span className="mono text-[11px] text-white/45 tabular-nums">
                        {statusData?.capturesCount ?? 0} staged captures
                      </span>
                    </div>

                    {companionLoading ? (
                      <div className="py-6 text-center text-xs text-white/50">
                        Loading paired devices…
                      </div>
                    ) : companionDevices.length === 0 ? (
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-6 text-center text-xs text-white/55">
                        No browser extensions paired yet. Enter a device label above and click &ldquo;Generate Device Token&rdquo; to connect Chrome or Edge.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-white/10">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] font-medium text-white/50">
                              <th className="py-2 px-3">Device</th>
                              <th className="py-2 px-3">Token Prefix</th>
                              <th className="py-2 px-3">Last Used</th>
                              <th className="py-2 px-3">Status</th>
                              <th className="py-2 px-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.06]">
                            {companionDevices.map((dev) => {
                              const isRevoked = Boolean(dev.revoked_at);
                              return (
                                <tr key={dev.id} className="text-white/80">
                                  <td className="py-2.5 px-3 font-medium text-white whitespace-nowrap">
                                    {dev.name}
                                  </td>
                                  <td className="py-2.5 px-3 mono text-[11px] text-white/60">
                                    {dev.token_prefix}
                                  </td>
                                  <td className="py-2.5 px-3 mono text-[11px] text-white/50 tabular-nums whitespace-nowrap">
                                    {formatTimestamp(dev.last_used_at)}
                                  </td>
                                  <td className="py-2.5 px-3 mono text-[11px]">
                                    {isRevoked ? (
                                      <span className="text-rose-300">Revoked</span>
                                    ) : (
                                      <span className="text-emerald-300">Active</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    {!isRevoked ? (
                                      <button
                                        type="button"
                                        disabled={revokingDeviceId === dev.id}
                                        onClick={() => handleRevokeCompanionDevice(dev)}
                                        className="rounded-md border border-rose-500/35 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-40 transition"
                                      >
                                        {revokingDeviceId === dev.id
                                          ? 'Revoking…'
                                          : 'Revoke'}
                                      </button>
                                    ) : (
                                      <span className="text-[11px] text-white/35">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ===============================================================
                7. SYSTEM & DIAGNOSTICS (Includes Local Security & Privacy Posture)
               =============================================================== */}
            {showSection('diagnostics') && (
              <div className="space-y-6">
                <section
                  data-testid="system-diagnostics-settings-panel"
                  className="rounded-xl border border-white/10 bg-[#080b14] overflow-hidden"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                    <div>
                      <h2 className="text-sm font-semibold text-white">
                        7. System & Diagnostics
                      </h2>
                      <p className="mt-0.5 text-xs text-white/50">
                        SQLite engine health, applied schema migrations, audit log access, and global reset.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {onOpenActivityLog && (
                        <button
                          type="button"
                          onClick={onOpenActivityLog}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.1] transition whitespace-nowrap"
                        >
                          <span>Open Activity Log</span>
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                      {!confirmResetAll ? (
                        <button
                          type="button"
                          onClick={() => setConfirmResetAll(true)}
                          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/20 transition whitespace-nowrap"
                        >
                          Reset All Settings
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={savingSettings}
                            onClick={() => {
                              setConfirmResetAll(false);
                              setGlobalSettings(DEFAULT_ARGON_SETTINGS);
                              handleSaveGlobalSettings(
                                DEFAULT_ARGON_SETTINGS,
                                'Restored all application settings to factory defaults.'
                              );
                            }}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 transition whitespace-nowrap"
                          >
                            Confirm Reset
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmResetAll(false)}
                            className="rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/75 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <dl className="divide-y divide-white/[0.06] px-5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 py-3.5">
                      <dt className="text-white/55">SQLite Engine & Journal Mode</dt>
                      <dd className="mono text-emerald-300">
                        node:sqlite (DatabaseSync) ·{' '}
                        {statusData?.journalMode?.toUpperCase() || 'WAL'} · Schema v
                        {statusData?.schemaVersion ?? 5}
                      </dd>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 py-3.5">
                      <dt className="text-white/55">Database Integrity</dt>
                      <dd className="mono text-white/90">
                        PRAGMA integrity_check ={' '}
                        <span className="text-emerald-300">
                          {statusData?.integrityStatus || 'ok'}
                        </span>
                      </dd>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 py-3.5">
                      <dt className="text-white/55">Active Batch / Queue Capabilities</dt>
                      <dd className="mono text-[#9db4ff] tabular-nums">
                        {globalSettings.importProcessing.maxFilesPerBatch.toLocaleString()}{' '}
                        files/batch · Concurrency{' '}
                        {globalSettings.importProcessing.concurrency}
                      </dd>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 py-3.5">
                      <dt className="text-white/55">Workspace Counters</dt>
                      <dd className="mono text-white/85 tabular-nums">
                        {statusData?.factsCount ?? 0} facts ·{' '}
                        {statusData?.brainsCount ?? 0} brains ·{' '}
                        {statusData?.devicesCount ?? 0} paired devices ·{' '}
                        {verifiedCount} verified backups
                      </dd>
                    </div>
                    {statusData?.appliedMigrations &&
                      statusData.appliedMigrations.length > 0 && (
                        <div className="py-3.5 space-y-1.5">
                          <dt className="text-white/55">Applied Schema Migrations</dt>
                          <dd className="mono text-[11px] text-white/65">
                            {statusData.appliedMigrations
                              .map((m) => `v${m.version} (${m.name})`)
                              .join(' · ')}
                          </dd>
                        </div>
                      )}
                  </dl>
                </section>

                {/* Live Local Security & Privacy Posture */}
                <SecurityAndPortableSection
                  availableBrains={availableBrains}
                  showPortable={false}
                  showSecurity={true}
                  onDataImported={() => {
                    loadDatabaseStatus(true);
                    if (onAfterRestore) onAfterRestore();
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
