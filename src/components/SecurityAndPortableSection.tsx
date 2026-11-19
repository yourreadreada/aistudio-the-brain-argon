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
  // Security & Privacy Posture state
  const [posture, setPosture] = useState<any | null>(null);
  const [postureLoading, setPostureLoading] = useState<boolean>(false);
  const [hardening, setHardening] = useState<boolean>(false);
  const [securityBanner, setSecurityBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Portable Format Export state
  const [exportBrain, setExportBrain] = useState<string>('all');
  const [exportSource, setExportSource] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [excludeSecrets, setExcludeSecrets] = useState<boolean>(true);
  const [includeAttachments, setIncludeAttachments] = useState<boolean>(false);

  // Portable Format Import state
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
        message: `Imported portable package (${res.importedCount} new, ${res.mergedCount} merged, ${res.replacedCount} replaced, ${res.skippedCount} skipped).`,
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
      {/* SECTION 5.4: PORTABLE BRAIN FORMAT FAMILY */}
      {showPortable && (
        <div
          data-testid="portable-formats-panel"
          className="rounded-2xl border border-white/10 bg-[#080b14] p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/85">
                <Package className="h-4 w-4 text-[#9db4ff]" />
                <span>Portable Brain Format Family (.brain.json · .brain.md · .brainpack.zip)</span>
              </h2>
              <p className="mt-1 text-xs text-white/55 leading-relaxed">
                Versioned, checksum-verified exports for reading, archiving, and cross-Brain transfer.{' '}
                <strong className="text-white/80">
                  Portable exports are distinct from SQLite .db disaster-recovery backups
                </strong>{' '}
                and exclude detected secrets/private-tagged facts by default.
              </p>
            </div>
          </div>

          {portableBanner && (
            <div
              className={`rounded-xl border px-3.5 py-2.5 text-xs ${
                portableBanner.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
              }`}
            >
              {portableBanner.message}
            </div>
          )}

          {/* Selective Export Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <label className="space-y-1">
              <span className="mono text-[10.5px] uppercase tracking-wider text-white/50">
                Brain Scope
              </span>
              <select
                value={exportBrain}
                onChange={(e) => setExportBrain(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
              >
                <option value="all">All Brains</option>
                {availableBrains.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="mono text-[10.5px] uppercase tracking-wider text-white/50">
                Source Filter
              </span>
              <select
                value={exportSource}
                onChange={(e) => setExportSource(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
              >
                <option value="all">All Sources</option>
                <option value="claude">Claude</option>
                <option value="gpt">ChatGPT</option>
                <option value="gemini">Gemini</option>
                <option value="cursor">Cursor</option>
                <option value="github">GitHub</option>
                <option value="moodle">Moodle</option>
                <option value="local-ai">Local AI / Ollama</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="mono text-[10.5px] uppercase tracking-wider text-white/50">
                From Date (Optional)
              </span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="mono text-[10.5px] uppercase tracking-wider text-white/50">
                To Date (Optional)
              </span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-xs text-white"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-white/75">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeSecrets}
                onChange={(e) => setExcludeSecrets(e.target.checked)}
                className="rounded border-white/30 bg-black/60"
              />
              <span>Redact API keys/tokens & exclude private-tagged memories (default)</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAttachments}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
                className="rounded border-white/30 bg-black/60"
              />
              <span>Include text attachments in .brainpack.zip (explicit opt-in)</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              data-testid="export-brain-json-btn"
              onClick={() => handleTriggerPortableDownload('json')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/15 transition min-h-[38px]"
            >
              <FileJson className="h-3.5 w-3.5 text-[#9db4ff]" />
              <span>Export .brain.json</span>
              <Download className="h-3 w-3 text-white/60" />
            </button>

            <button
              type="button"
              data-testid="export-brain-md-btn"
              onClick={() => handleTriggerPortableDownload('md')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/15 transition min-h-[38px]"
            >
              <FileText className="h-3.5 w-3.5 text-emerald-300" />
              <span>Export .brain.md</span>
              <Download className="h-3 w-3 text-white/60" />
            </button>

            <button
              type="button"
              data-testid="export-brainpack-zip-btn"
              onClick={() => handleTriggerPortableDownload('zip')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#9db4ff]/35 bg-[#9db4ff]/15 px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#9db4ff]/25 transition min-h-[38px]"
            >
              <FileArchive className="h-3.5 w-3.5 text-[#9db4ff]" />
              <span>Export .brainpack.zip</span>
              <Download className="h-3 w-3 text-white/75" />
            </button>
          </div>

          {/* Round-Trip Portable Import with Preview & Conflict Resolution */}
          <div className="rounded-xl border border-white/10 bg-black/35 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-white">
                  Inspect & Import Portable Package
                </h3>
                <p className="text-[11px] text-white/55">
                  Verifies SHA-256 checksums, previews new/duplicate/conflict records, and imports atomically with provenance preserved.
                </p>
              </div>
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/15 transition cursor-pointer min-h-[38px]">
                <Upload className="h-3.5 w-3.5" />
                <span>{inspecting ? 'Verifying...' : 'Select .brain.json / .md / .zip'}</span>
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
              <div className="mono text-[11px] text-white/65">
                Selected: <span className="text-white">{selectedFile.name}</span>
              </div>
            )}

            {inspectionResult && (
              <div
                className={`rounded-xl border p-3.5 space-y-3 text-xs ${
                  inspectionResult.valid
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-rose-500/30 bg-rose-500/10'
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
                      <span className="mono text-[11px] text-white/70 tabular-nums">
                        {inspectionResult.summary.newCount} new ·{' '}
                        {inspectionResult.summary.exactDuplicateCount} duplicate ·{' '}
                        {inspectionResult.summary.conflictCount} conflict
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <label className="inline-flex items-center gap-2 text-white/80">
                        <span className="mono text-[11px]">Conflict policy:</span>
                        <select
                          value={conflictPolicy}
                          onChange={(e) =>
                            setConflictPolicy(e.target.value as 'skip' | 'merge' | 'replace')
                          }
                          className="rounded-lg border border-white/20 bg-black/60 px-2.5 py-1.5 text-xs text-white"
                        >
                          <option value="skip">Skip conflicts (safest)</option>
                          <option value="merge">Merge with history</option>
                          <option value="replace">Replace (creates pre-import backup)</option>
                        </select>
                      </label>

                      <button
                        type="button"
                        disabled={importing}
                        onClick={handleExecutePortableImport}
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#04110b] hover:bg-emerald-400 transition disabled:opacity-40 min-h-[38px]"
                      >
                        {importing ? 'Importing...' : 'Confirm & Import Package'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2.2: LOCAL SECURITY & PRIVACY POSTURE */}
      {showSecurity && (
        <div
          data-testid="security-privacy-posture-panel"
          className="rounded-2xl border border-white/10 bg-[#080b14] p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/85">
                <Shield className="h-4 w-4 text-emerald-400" />
                <span>Local Security & Privacy Posture (Verified Live)</span>
              </h2>
              <p className="mt-1 text-xs text-white/55 leading-relaxed">
                Truthful inspection of on-disk encryption status, POSIX file permissions, secret handling, and network boundaries.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="harden-permissions-btn"
                onClick={handleHardenPermissions}
                disabled={hardening}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 transition min-h-[36px]"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>{hardening ? 'Applying...' : 'Enforce 0600 Permissions'}</span>
              </button>
              <button
                type="button"
                onClick={loadPosture}
                disabled={postureLoading}
                aria-label="Refresh security posture audit"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 p-2 text-white/75 hover:bg-white/10 transition h-9 w-9"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${postureLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {securityBanner && (
            <div
              className={`rounded-xl border px-3.5 py-2.5 text-xs ${
                securityBanner.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
              }`}
            >
              {securityBanner.message}
            </div>
          )}

          {posture && (
            <div className="space-y-4">
              {/* Honest Encryption at Rest & Operating Mode Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div
                  data-testid="encryption-at-rest-card"
                  className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="mono text-[11px] font-semibold uppercase tracking-wider text-amber-200">
                      Encryption at Rest (Disk Audit)
                    </span>
                    <span className="mono text-[10px] px-2 py-0.5 rounded border border-amber-400/40 bg-black/40 text-amber-200">
                      {posture.encryptionAtRest.encryptedAtRest
                        ? 'ENCRYPTED'
                        : 'UNENCRYPTED SQLITE'}
                    </span>
                  </div>
                  <p className="text-xs text-amber-100/90 leading-relaxed">
                    {posture.encryptionAtRest.summary}
                  </p>
                  <p className="text-[11px] text-white/75">
                    <strong>Recommendation:</strong> {posture.encryptionAtRest.recommendation}
                  </p>
                </div>

                <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="mono text-[11px] font-semibold uppercase tracking-wider text-sky-200">
                      Operating Mode Classification
                    </span>
                    <span className="mono text-[10px] px-2 py-0.5 rounded border border-sky-400/40 bg-black/40 text-sky-200 uppercase">
                      {posture.operatingMode.replace('_', '-')}
                    </span>
                  </div>
                  <p className="text-xs text-white/85 leading-relaxed">
                    {posture.operatingModeSummary}
                  </p>
                  <p className="text-[11px] text-white/65">
                    <strong>Ollama (`07_local_ai_ollama`):</strong> {posture.ollamaLocalBehaviour.summary}
                  </p>
                </div>
              </div>

              {/* File Permissions Table */}
              <div className="rounded-xl border border-white/10 bg-black/35 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="mono text-[11px] uppercase tracking-wider text-white/60">
                    SQLite, WAL & Backup File Permissions ({posture.filePermissions.platform})
                  </span>
                  <span
                    className={`mono text-[10.5px] font-semibold ${
                      posture.filePermissions.allPresentFilesOwnerOnly
                        ? 'text-emerald-300'
                        : 'text-amber-300'
                    }`}
                  >
                    {posture.filePermissions.allPresentFilesOwnerOnly
                      ? 'All present files restricted to owner (0600/0700)'
                      : 'Click "Enforce 0600 Permissions" to tighten'}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 mono text-[10px] uppercase text-white/45">
                        <th className="py-1.5 pr-3">File</th>
                        <th className="py-1.5 pr-3">Mode</th>
                        <th className="py-1.5 pr-3">Owner-Only</th>
                        <th className="py-1.5">Path</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {posture.filePermissions.files.map((f: any) => (
                        <tr key={f.label} className="text-white/75">
                          <td className="py-1.5 pr-3 whitespace-nowrap font-medium text-white/90">
                            {f.label}
                          </td>
                          <td className="py-1.5 pr-3 mono tabular-nums">
                            {f.exists ? f.modeOctal || 'n/a' : 'not present'}
                          </td>
                          <td className="py-1.5 pr-3 mono">
                            {!f.exists ? (
                              <span className="text-white/40">—</span>
                            ) : f.ownerOnly ? (
                              <span className="text-emerald-300">Yes</span>
                            ) : (
                              <span className="text-amber-300">Broad</span>
                            )}
                          </td>
                          <td className="py-1.5 mono text-[10.5px] text-white/50 truncate max-w-[260px]">
                            {f.filePath}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Credentials & Secret Handling */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-white/10 bg-black/35 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <KeyRound className="h-3.5 w-3.5 text-[#9db4ff]" />
                    <span>Tokens, API Keys & Log Redaction</span>
                  </div>
                  <ul className="space-y-1 text-white/70 text-[11.5px]">
                    <li>
                      • Companion tokens hashed (SHA-256):{' '}
                      <strong className="text-emerald-300">
                        {posture.credentialsAndSecrets.companionTokensStoredHashedOnly
                          ? 'Verified (0 plaintext rows)'
                          : `${posture.credentialsAndSecrets.plaintextTokenRowsDetected} plaintext row(s)`}
                      </strong>
                    </li>
                    <li>
                      • Optional <code>GEMINI_API_KEY</code>:{' '}
                      <strong className="text-white">
                        {posture.credentialsAndSecrets.geminiApiKeyConfigured
                          ? 'Configured in server env'
                          : 'Unset (local-only fallback active)'}
                      </strong>
                    </li>
                    <li>
                      • Activity log & export secret redaction:{' '}
                      <strong className="text-emerald-300">Active</strong>
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/35 p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Network className="h-3.5 w-3.5 text-[#9db4ff]" />
                    <span>Deletion, WAL & Network Binding</span>
                  </div>
                  <p className="text-[11.5px] text-white/70 leading-relaxed">
                    HTTP server binds strictly to <code className="text-emerald-300">{posture.bindHost}</code>.{' '}
                    {posture.retentionAndDeletion.deletionSemantics}
                  </p>
                </div>
              </div>

              {/* Data Flow Matrix */}
              <div className="rounded-xl border border-white/10 bg-black/35 p-3.5 space-y-2">
                <div className="mono text-[11px] uppercase tracking-wider text-white/60">
                  What Stays On-Device vs. What Leaves the Device
                </div>
                <div className="space-y-2">
                  {posture.networkAndDataFlow.map((row: any) => (
                    <div
                      key={row.id}
                      className="rounded-lg border border-white/8 bg-white/[0.02] p-3 text-xs space-y-1"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-white">{row.surface}</span>
                        <span
                          className={`mono text-[10px] px-2 py-0.5 rounded border ${
                            row.classification === 'local_only'
                              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                              : row.classification === 'optional_external'
                                ? 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                                : 'border-sky-500/30 bg-sky-500/15 text-sky-300'
                          }`}
                        >
                          {row.classification === 'local_only'
                            ? 'LOCAL ONLY'
                            : row.classification === 'optional_external'
                              ? row.activeNow
                                ? 'OPTIONAL EXTERNAL (ACTIVE)'
                                : 'OPTIONAL EXTERNAL (INACTIVE)'
                              : 'EXTERNAL WEB ASSET'}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-white/75">
                        <strong className="text-white/90">Stays local:</strong> {row.staysOnDevice}
                      </p>
                      <p className="text-[11.5px] text-white/65">
                        <strong className="text-white/85">Leaves device:</strong> {row.leavesDevice}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
