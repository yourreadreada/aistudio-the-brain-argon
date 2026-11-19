import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield,
  Lock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Package,
  Download,
  Upload,
  FileJson,
  FileText,
  FileArchive,
  Network,
  KeyRound,
} from 'lucide-react';
import { brainStore } from '../services/brainStorage';

interface SecurityAndPortableSectionProps {
  availableBrains: string[];
  showSecurity: boolean;
  showPortable: boolean;
  onDataImported?: () => void;
}

export const SecurityAndPortableSection: React.FC<SecurityAndPortableSectionProps> = ({
  availableBrains,
  showSecurity,
  showPortable,
  onDataImported,
}) => {
  const [posture, setPosture] = useState<any | null>(null);
  const [postureLoading, setPostureLoading] = useState<boolean>(false);
  const [hardening, setHardening] = useState<boolean>(false);
  const [securityBanner, setSecurityBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [exportBrain, setExportBrain] = useState<string>('all');
  const [exportSource, setExportSource] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [excludeSecrets, setExcludeSecrets] = useState<boolean>(true);
  const [includeAttachments, setIncludeAttachments] = useState<boolean>(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePayload, setFilePayload] = useState<{
    format: 'json' | 'md' | 'zip';
    fileName: string;
    content?: string;
    base64?: string;
  } | null>(null);
  const [inspecting, setInspecting] = useState<boolean>(false);
  const [inspectionResult, setInspectionResult] = useState<any | null>(null);
  const [conflictPolicy, setConflictPolicy] = useState<'skip' | 'merge' | 'replace'>('skip');
  const [importing, setImporting] = useState<boolean>(false);
  const [portableBanner, setPortableBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const portableFileInputRef = useRef<HTMLInputElement | null>(null);

  const resolvedBrains =
    availableBrains.length > 0 ? availableBrains : brainStore.getBrains();

  const loadPosture = useCallback(async () => {
    setPostureLoading(true);
    try {
      const data = await brainStore.fetchSecurityPosture();
      setPosture(data);
    } catch (err: any) {
      setSecurityBanner({
        type: 'error',
        message: err?.message || 'Unable to inspect local security posture.',
      });
    } finally {
      setPostureLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showSecurity) {
      loadPosture();
    }
  }, [showSecurity, loadPosture]);

  const handleHardenPermissions = async () => {
    setHardening(true);
    setSecurityBanner(null);
    try {
      const res = await brainStore.hardenSecurityPermissions();
      if (res.posture) setPosture(res.posture);
      setSecurityBanner({
        type: 'success',
        message: `Enforced owner-only POSIX permissions (0600/0700). Updated ${
          res.result?.updatedFiles?.length ?? 0
        } path(s).`,
      });
    } catch (err: any) {
      setSecurityBanner({
        type: 'error',
        message: err?.message || 'Permission hardening failed.',
      });
    } finally {
      setHardening(false);
    }
  };

  const handleTriggerPortableDownload = (format: 'json' | 'md' | 'zip') => {
    const url = brainStore.getPortableExportUrl({
      format,
      brain: exportBrain,
      source: exportSource,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      excludeSecrets,
      includeAttachments: format === 'zip' ? includeAttachments : false,
    });
    const link = document.createElement('a');
    link.href = url;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setPortableBanner({
      type: 'success',
      message: `Started ${
        format === 'json'
          ? '.brain.json'
          : format === 'md'
            ? '.brain.md'
            : '.brainpack.zip'
      } export (${exportBrain === 'all' ? 'All Brains' : exportBrain}${
        exportSource !== 'all' ? ` · ${exportSource}` : ''
      }).`,
    });
  };

  const handleSelectPortableFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setInspectionResult(null);
    setPortableBanner(null);
    setInspecting(true);

    try {
      const lower = file.name.toLowerCase();
      let payload: {
        format: 'json' | 'md' | 'zip';
        fileName: string;
        content?: string;
        base64?: string;
      };

      if (lower.endsWith('.zip')) {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        payload = { format: 'zip', fileName: file.name, base64: btoa(binary) };
      } else if (lower.endsWith('.md')) {
        const text = await file.text();
        payload = { format: 'md', fileName: file.name, content: text };
      } else {
        const text = await file.text();
        payload = { format: 'json', fileName: file.name, content: text };
      }

      setFilePayload(payload);
      const preview = await brainStore.inspectPortablePackage(payload);
      setInspectionResult(preview);
    } catch (err: any) {
      setInspectionResult({
        valid: false,
        error: err?.message || 'Could not inspect selected portable file.',
      });
    } finally {
      setInspecting(false);
    }
  };

  const handleExecutePortableImport = async () => {
    if (!filePayload || !inspectionResult?.valid) return;
    setImporting(true);
    setPortableBanner(null);
    try {
      const res = await brainStore.importPortablePackage({
        ...filePayload,
        conflictPolicy,
      });
      setPortableBanner({
        type: 'success',
        message: `Imported portable package: ${res.importedCount} new, ${res.mergedCount} merged, ${res.replacedCount} replaced, ${res.skippedCount} skipped.`,
      });
      setInspectionResult(null);
      setSelectedFile(null);
      setFilePayload(null);
      if (portableFileInputRef.current) portableFileInputRef.current.value = '';
      if (onDataImported) onDataImported();
    } catch (err: any) {
      setPortableBanner({
        type: 'error',
        message: err?.message || 'Portable package import failed.',
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      {showPortable && (
        <section
          data-testid="portable-formats-panel"
          className="rounded-xl border border-white/10 bg-[#080b14] overflow-hidden"
        >
          <div className="border-b border-white/10 px-5 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Package className="h-4 w-4 text-[#9db4ff]" />
              <span>Portable Brain Exports & Round-Trip Import</span>
            </h3>
            <p className="mt-1 text-xs text-white/55 leading-relaxed">
              Versioned, SHA-256 verified packages (.brain.json, .brain.md, .brainpack.zip) for archiving and moving memories between workspaces.{' '}
              <span className="text-white/80 font-medium">
                Distinct from full SQLite .db disaster-recovery backups
              </span>{' '}
              and redacts detected secrets by default.
            </p>
          </div>

          <div className="p-5 space-y-5">
            {portableBanner && (
              <div
                role="status"
                className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-xs ${
                  portableBanner.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                }`}
              >
                <span>{portableBanner.message}</span>
                <button
                  type="button"
                  onClick={() => setPortableBanner(null)}
                  className="text-white/55 hover:text-white shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <label className="space-y-1.5">
                <span className="block text-[11px] font-medium text-white/60">
                  Brain Scope
                </span>
                <select
                  value={exportBrain}
                  onChange={(e) => setExportBrain(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-white focus:border-[#9db4ff] focus:outline-none"
                >
                  <option value="all" className="bg-[#050711]">
                    All Brains
                  </option>
                  {resolvedBrains.map((b) => (
                    <option key={b} value={b} className="bg-[#050711]">
                      {b}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="block text-[11px] font-medium text-white/60">
                  Source Filter
                </span>
                <select
                  value={exportSource}
                  onChange={(e) => setExportSource(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-white focus:border-[#9db4ff] focus:outline-none"
                >
                  <option value="all" className="bg-[#050711]">
                    All Sources
                  </option>
                  <option value="claude" className="bg-[#050711]">
                    Claude
                  </option>
                  <option value="gpt" className="bg-[#050711]">
                    ChatGPT
                  </option>
                  <option value="gemini" className="bg-[#050711]">
                    Gemini
                  </option>
                  <option value="cursor" className="bg-[#050711]">
                    Cursor
                  </option>
                  <option value="github" className="bg-[#050711]">
                    GitHub
                  </option>
                  <option value="moodle" className="bg-[#050711]">
                    Moodle
                  </option>
                  <option value="local-ai" className="bg-[#050711]">
                    Local AI / Ollama
                  </option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="block text-[11px] font-medium text-white/60">
                  From Date
                </span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-white focus:border-[#9db4ff] focus:outline-none"
                />
              </label>

              <label className="space-y-1.5">
                <span className="block text-[11px] font-medium text-white/60">
                  To Date
                </span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs text-white focus:border-[#9db4ff] focus:outline-none"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/75">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeSecrets}
                  onChange={(e) => setExcludeSecrets(e.target.checked)}
                  className="h-4 w-4 rounded border-white/30 bg-black/60 accent-[#9db4ff]"
                />
                <span>Redact API keys/tokens & exclude private-tagged memories</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAttachments}
                  onChange={(e) => setIncludeAttachments(e.target.checked)}
                  className="h-4 w-4 rounded border-white/30 bg-black/60 accent-[#9db4ff]"
                />
                <span>Include text attachments in .brainpack.zip</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                data-testid="export-brain-json-btn"
                onClick={() => handleTriggerPortableDownload('json')}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-medium text-white hover:bg-white/[0.1] transition whitespace-nowrap"
              >
                <FileJson className="h-3.5 w-3.5 text-[#9db4ff]" />
                <span>Export .brain.json</span>
                <Download className="h-3 w-3 text-white/55" />
              </button>

              <button
                type="button"
                data-testid="export-brain-md-btn"
                onClick={() => handleTriggerPortableDownload('md')}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-medium text-white hover:bg-white/[0.1] transition whitespace-nowrap"
              >
                <FileText className="h-3.5 w-3.5 text-emerald-300" />
                <span>Export .brain.md</span>
                <Download className="h-3 w-3 text-white/55" />
              </button>

              <button
                type="button"
                data-testid="export-brainpack-zip-btn"
                onClick={() => handleTriggerPortableDownload('zip')}
                className="inline-flex items-center gap-2 rounded-lg border border-[#9db4ff]/35 bg-[#9db4ff]/15 px-4 py-2 text-xs font-semibold text-white hover:bg-[#9db4ff]/25 transition whitespace-nowrap"
              >
                <FileArchive className="h-3.5 w-3.5 text-[#9db4ff]" />
                <span>Export .brainpack.zip</span>
                <Download className="h-3 w-3 text-white/75" />
              </button>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">
                    Inspect & Import Portable Package
                  </h4>
                  <p className="mt-0.5 text-xs text-white/50">
                    Verifies SHA-256 checksums, previews new/duplicate/conflict items, and imports atomically.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-medium text-white hover:bg-white/[0.1] transition cursor-pointer whitespace-nowrap">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{inspecting ? 'Verifying…' : 'Select .brain.json / .md / .zip'}</span>
                  <input
                    ref={portableFileInputRef}
                    type="file"
                    accept=".json,.md,.zip"
                    onChange={handleSelectPortableFile}
                    className="hidden"
                  />
                </label>
              </div>

              {selectedFile && (
                <div className="mono text-[11px] text-white/60">
                  Selected: <span className="text-white">{selectedFile.name}</span>
                </div>
              )}

              {inspectionResult && (
                <div
                  className={`rounded-lg border p-3.5 space-y-3 text-xs ${
                    inspectionResult.valid
                      ? 'border-emerald-500/30 bg-emerald-500/[0.07]'
                      : 'border-rose-500/30 bg-rose-500/[0.07]'
                  }`}
                >
                  {!inspectionResult.valid ? (
                    <div className="flex items-start gap-2 text-rose-200">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Package Verification Failed</div>
                        <p className="mt-0.5">{inspectionResult.error}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-semibold text-emerald-200">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          <span>
                            SHA-256 Verified · Schema v{inspectionResult.schemaVersion} ({inspectionResult.format})
                          </span>
                        </div>
                        <span className="mono text-[11px] text-white/75 tabular-nums">
                          {inspectionResult.summary.newCount} new ·{' '}
                          {inspectionResult.summary.exactDuplicateCount} duplicate ·{' '}
                          {inspectionResult.summary.conflictCount} conflict
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <label className="inline-flex items-center gap-2 text-white/80">
                          <span className="text-xs text-white/60">Conflict policy:</span>
                          <select
                            value={conflictPolicy}
                            onChange={(e) =>
                              setConflictPolicy(e.target.value as 'skip' | 'merge' | 'replace')
                            }
                            className="rounded-lg border border-white/20 bg-black/60 px-2.5 py-1.5 text-xs text-white focus:border-[#9db4ff] focus:outline-none"
                          >
                            <option value="skip" className="bg-[#050711]">
                              Skip conflicts (safest)
                            </option>
                            <option value="merge" className="bg-[#050711]">
                              Merge with history
                            </option>
                            <option value="replace" className="bg-[#050711]">
                              Replace (creates pre-import backup)
                            </option>
                          </select>
                        </label>

                        <button
                          type="button"
                          disabled={importing}
                          onClick={handleExecutePortableImport}
                          className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#04110b] hover:bg-emerald-400 transition disabled:opacity-40 whitespace-nowrap"
                        >
                          {importing ? 'Importing…' : 'Confirm & Import Package'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {showSecurity && (
        <section
          data-testid="security-privacy-posture-panel"
          className="rounded-xl border border-white/10 bg-[#080b14] overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Shield className="h-4 w-4 text-emerald-400" />
                <span>Local Security & Privacy Posture</span>
              </h3>
              <p className="mt-0.5 text-xs text-white/55">
                Live disk audit of SQLite encryption status, POSIX file permissions, secret handling, and network boundaries.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="harden-permissions-btn"
                onClick={handleHardenPermissions}
                disabled={hardening}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 transition whitespace-nowrap disabled:opacity-50"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>{hardening ? 'Applying…' : 'Enforce 0600 Permissions'}</span>
              </button>
              <button
                type="button"
                onClick={loadPosture}
                disabled={postureLoading}
                aria-label="Refresh security posture audit"
                title="Refresh security audit"
                className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/[0.04] p-2 text-white/75 hover:bg-white/[0.09] transition h-9 w-9"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${postureLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {securityBanner && (
              <div
                role="status"
                className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-xs ${
                  securityBanner.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                }`}
              >
                <span>{securityBanner.message}</span>
                <button
                  type="button"
                  onClick={() => setSecurityBanner(null)}
                  className="text-white/55 hover:text-white shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {postureLoading && !posture && (
              <div className="py-6 text-center text-xs text-white/50">
                Inspecting on-disk SQLite header, permissions, and token records…
              </div>
            )}

            {posture && (
              <div className="space-y-5">
                {/* Honest Disk Encryption & Operating Mode Summary */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div
                    data-testid="encryption-at-rest-card"
                    className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-4 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-amber-200">
                        Encryption at Rest
                      </span>
                      <span className="mono text-[11px] font-semibold text-amber-300">
                        {posture.encryptionAtRest.encryptedAtRest
                          ? 'Encrypted'
                          : 'Unencrypted SQLite'}
                      </span>
                    </div>
                    <p className="text-xs text-white/80 leading-relaxed">
                      {posture.encryptionAtRest.summary}
                    </p>
                    <p className="text-[11px] text-white/60 leading-relaxed">
                      <span className="text-white/80 font-medium">Recommendation:</span>{' '}
                      {posture.encryptionAtRest.recommendation}
                    </p>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-white">
                        Operating Mode
                      </span>
                      <span className="mono text-[11px] font-semibold text-sky-300">
                        {posture.operatingMode.replace('_', '-')}
                      </span>
                    </div>
                    <p className="text-xs text-white/80 leading-relaxed">
                      {posture.operatingModeSummary}
                    </p>
                    <p className="text-[11px] text-white/60 leading-relaxed">
                      <span className="text-white/80 font-medium">Ollama (07_local_ai_ollama):</span>{' '}
                      {posture.ollamaLocalBehaviour.summary}
                    </p>
                  </div>
                </div>

                {/* File Permissions Table */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-white">
                      File Permissions ({posture.filePermissions.platform})
                    </span>
                    <span
                      className={`mono text-[11px] ${
                        posture.filePermissions.allPresentFilesOwnerOnly
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }`}
                    >
                      {posture.filePermissions.allPresentFilesOwnerOnly
                        ? 'All present files owner-only (0600/0700)'
                        : 'Action recommended: click Enforce 0600 Permissions'}
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-white/10">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.02] text-[11px] font-medium text-white/50">
                          <th className="py-2 px-3">File</th>
                          <th className="py-2 px-3">Mode</th>
                          <th className="py-2 px-3">Owner-Only</th>
                          <th className="py-2 px-3">Path</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {posture.filePermissions.files.map((f: any) => (
                          <tr key={f.label} className="text-white/75">
                            <td className="py-2 px-3 whitespace-nowrap font-medium text-white/90">
                              {f.label}
                            </td>
                            <td className="py-2 px-3 mono tabular-nums">
                              {f.exists ? f.modeOctal || 'n/a' : 'not present'}
                            </td>
                            <td className="py-2 px-3 mono">
                              {!f.exists ? (
                                <span className="text-white/35">—</span>
                              ) : f.ownerOnly ? (
                                <span className="text-emerald-300">Yes</span>
                              ) : (
                                <span className="text-amber-300">Broad</span>
                              )}
                            </td>
                            <td className="py-2 px-3 mono text-[11px] text-white/50 truncate max-w-[320px]">
                              {f.filePath}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Credentials & Network Binding */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/10 pt-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 font-semibold text-white">
                      <KeyRound className="h-3.5 w-3.5 text-[#9db4ff]" />
                      <span>Credentials & Secret Handling</span>
                    </div>
                    <ul className="space-y-1 text-white/70">
                      <li>
                        Companion tokens (SHA-256 only):{' '}
                        <span className="font-medium text-emerald-300">
                          {posture.credentialsAndSecrets.companionTokensStoredHashedOnly
                            ? 'Verified (0 plaintext rows)'
                            : `${posture.credentialsAndSecrets.plaintextTokenRowsDetected} plaintext row(s)`}
                        </span>
                      </li>
                      <li>
                        Optional <code className="mono text-white/85">GEMINI_API_KEY</code>:{' '}
                        <span className="font-medium text-white">
                          {posture.credentialsAndSecrets.geminiApiKeyConfigured
                            ? 'Configured in server env'
                            : 'Unset (local-only fallback)'}
                        </span>
                      </li>
                      <li>
                        Log & export secret redaction:{' '}
                        <span className="font-medium text-emerald-300">Active</span>
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 font-semibold text-white">
                      <Network className="h-3.5 w-3.5 text-[#9db4ff]" />
                      <span>Deletion & Network Binding</span>
                    </div>
                    <p className="text-white/70 leading-relaxed">
                      Server binds strictly to{' '}
                      <code className="mono text-emerald-300">{posture.bindHost}</code>.{' '}
                      {posture.retentionAndDeletion.deletionSemantics}
                    </p>
                  </div>
                </div>

                {/* Data Flow Matrix */}
                <div className="border-t border-white/10 pt-4 space-y-2.5">
                  <h4 className="text-xs font-semibold text-white">
                    Network & Data Flow Disclosure
                  </h4>
                  <div className="divide-y divide-white/[0.06] rounded-lg border border-white/10">
                    {posture.networkAndDataFlow.map((row: any) => (
                      <div key={row.id} className="px-3.5 py-2.5 text-xs space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-white">{row.surface}</span>
                          <span
                            className={`mono text-[11px] font-medium ${
                              row.classification === 'local_only'
                                ? 'text-emerald-300'
                                : row.classification === 'optional_external'
                                  ? 'text-amber-300'
                                  : 'text-sky-300'
                            }`}
                          >
                            {row.classification === 'local_only'
                              ? 'Local Only'
                              : row.classification === 'optional_external'
                                ? row.activeNow
                                  ? 'Optional External · Active'
                                  : 'Optional External · Inactive'
                                : 'External Web Asset'}
                          </span>
                        </div>
                        <div className="text-[11.5px] text-white/65">
                          <span className="text-white/85">Stays local:</span> {row.staysOnDevice}
                        </div>
                        <div className="text-[11.5px] text-white/55">
                          <span className="text-white/80">Leaves device:</span> {row.leavesDevice}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
};
