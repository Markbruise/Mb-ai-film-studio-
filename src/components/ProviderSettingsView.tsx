import React, { useState, useEffect } from 'react';
import {
  ProviderId,
  PROVIDER_SPECS,
  StudioLanguage,
  StudioUserSettings,
} from '../types/film';
import { SUPPORTED_LANGUAGES } from '../utils/i18n';
import {
  Settings,
  Cpu,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Languages,
  Sliders,
  Info,
} from 'lucide-react';

interface ProviderSettingsViewProps {
  settings: StudioUserSettings;
  onUpdateSettings: (next: StudioUserSettings) => void;
}

interface ProviderCheckItem {
  id: string;
  label: string;
  model: string;
  status: 'connected' | 'requires_billing_or_vertex' | 'unavailable';
  detail: string;
}

interface DiagnosticsReport {
  geminiConfigured: boolean;
  providers: ProviderCheckItem[];
  subscriptionNotice?: string;
  checkedAt?: string;
}

export const ProviderSettingsView: React.FC<ProviderSettingsViewProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const [diag, setDiag] = useState<DiagnosticsReport | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setIsTesting(true);
    setDiagError(null);
    try {
      const res = await fetch('/api/diagnostics/provider-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Diagnostics request failed');
      setDiag(data);
    } catch (err: any) {
      setDiagError(err.message || 'Could not reach server diagnostics');
    } finally {
      setIsTesting(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const renderBadge = (status: ProviderCheckItem['status']) => {
    if (status === 'connected') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" />
          <span>CONNECTED</span>
        </span>
      );
    }
    if (status === 'requires_billing_or_vertex') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <AlertTriangle className="w-3 h-3" />
          <span>QUOTA / VERTEX</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
        <XCircle className="w-3 h-3" />
        <span>UNAVAILABLE</span>
      </span>
    );
  };

  return (
    <div className="bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl p-5 sm:p-6 text-zinc-100 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 uppercase tracking-widest mb-1">
            <Settings className="w-4 h-4" />
            <span>Studio Configuration & Provider Health</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Language, Production Defaults & AI Diagnostics
          </h2>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Configure your interface language, default production parameters, and verify live model connections managed securely on the backend server.
          </p>
        </div>

        <button
          type="button"
          onClick={runDiagnostics}
          disabled={isTesting}
          className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
          <span>{isTesting ? 'Testing AI Models...' : 'Run Live Provider Test'}</span>
        </button>
      </div>

      {/* Language & Defaults */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900/60 p-5 rounded-xl border border-zinc-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-bold text-white">
            <Languages className="w-4 h-4 text-cyan-400" />
            <span>Multilingual Studio Preferences</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-zinc-400 block mb-1">Studio UI Interface Language</label>
              <select
                value={settings.uiLanguage}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    uiLanguage: e.target.value as StudioLanguage,
                  })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label} — {lang.nativeLabel} ({lang.dir.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1">Default Screenplay Language</label>
                <select
                  value={settings.defaultScreenplayLanguage}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      defaultScreenplayLanguage: e.target.value as StudioLanguage,
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Default Output / Dub Language</label>
                <select
                  value={settings.defaultOutputLanguage}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      defaultOutputLanguage: e.target.value as StudioLanguage,
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/60 p-5 rounded-xl border border-zinc-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-bold text-white">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Default Film Pipeline Settings</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-zinc-400 block mb-1">Primary Video Generation Engine</label>
              <select
                value={settings.defaultProvider}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    defaultProvider: e.target.value as ProviderId,
                  })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white"
              >
                {(['gemini-omni', 'veo3', 'veo2'] as ProviderId[]).map((pid) => (
                  <option key={pid} value={pid}>
                    {PROVIDER_SPECS[pid].name} (Max {PROVIDER_SPECS[pid].maxClipDuration}s/clip)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Default Export Resolution</label>
              <select
                value={settings.preferredResolution}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    preferredResolution: e.target.value as '720p' | '1080p' | '4K Cinema',
                  })
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white"
              >
                <option value="720p">720p HD (Fast Turnaround)</option>
                <option value="1080p">1080p Full HD (Broadcast Standard)</option>
                <option value="4K Cinema">4K Cinema Master</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Live Connected Models Matrix */}
      <div className="bg-zinc-900/60 p-5 rounded-xl border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-bold text-white">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span>Connected AI Models & Server Environment Diagnostics</span>
          </div>
          {diag && (
            <span className="text-[11px] font-mono text-zinc-400">
              API Key: {diag.geminiConfigured ? 'Configured Server-Side' : 'Missing'}
              {diag.checkedAt ? ` • Checked ${new Date(diag.checkedAt).toLocaleTimeString()}` : ''}
            </span>
          )}
        </div>

        {diagError && (
          <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200">
            {diagError}
          </div>
        )}

        {diag?.providers && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {diag.providers.map((info) => (
              <div
                key={info.id}
                className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white">{info.label}</span>
                  {renderBadge(info.status)}
                </div>
                <div className="text-[11px] font-mono text-cyan-400">{info.model}</div>
                <p className="text-[11px] text-zinc-400 leading-relaxed break-words">
                  {info.detail}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="p-4 rounded-xl bg-indigo-950/25 border border-indigo-500/30 flex items-start space-x-3 text-xs text-indigo-200/90">
          <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-white">
              Security & Billing Architecture Note
            </div>
            <p className="leading-relaxed">
              {diag?.subscriptionNotice ||
                'API credentials remain isolated exclusively on the backend server environment (GEMINI_API_KEY and optional VERTEX_PROJECT_ID). Consumer Google AI Pro / Flow web subscriptions do not provide programmatic API billing or OAuth quotas for external studio deployments.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
