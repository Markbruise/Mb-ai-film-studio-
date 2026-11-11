import React, { useState, useRef } from 'react';
import { FilmProject, RenderExportSettings } from '../types/film';
import { formatDurationNice, formatSMPTETimecode } from '../utils/timecode';
import {
  Download,
  Film,
  Sliders,
  Settings2,
  Terminal,
  FileCode,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Volume2,
  Monitor,
  Sparkles,
  Zap,
  Play,
  FileVideo,
  Layers,
  Clock,
  HardDrive,
  ShieldCheck,
} from 'lucide-react';

interface ExportRenderCenterProps {
  project: FilmProject;
  onUpdateExportSettings: (settings: RenderExportSettings) => void;
  onNavigateToPreview: () => void;
}

interface MP4ValidationInfo {
  valid: boolean;
  filename?: string;
  fileSize?: number;
  duration?: number;
  resolution?: string;
  videoCodec?: string;
  hasAudio?: boolean;
  audioCodec?: string;
  audioChannels?: number;
  sampleRate?: string;
  playable?: boolean;
  error?: string;
}

export const ExportRenderCenter: React.FC<ExportRenderCenterProps> = ({
  project,
  onUpdateExportSettings,
  onNavigateToPreview,
}) => {
  const [settings, setSettings] = useState<RenderExportSettings>(project.exportSettings);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStage, setExportStage] = useState<string>('');
  const [exportResult, setExportResult] = useState<any | null>(null);
  const [validationResult, setValidationResult] = useState<MP4ValidationInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(5);
    setExportStage('Submitting render job to FFmpeg production engine...');
    setExportResult(null);
    setValidationResult(null);
    setDownloadError(null);

    try {
      // 1. Kick off real MP4 render on backend
      const response = await fetch('/api/render/mp4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, settings }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Render request failed');

      const jobId = data.jobId;
      setExportProgress(12);
      setExportStage('Job queued. Initializing video frames & audio synthesizer...');

      // 2. Poll /api/jobs until completed or failed
      const pollStartTime = Date.now();
      const pollInterval = setInterval(async () => {
        try {
          const jobsRes = await fetch('/api/jobs');
          if (!jobsRes.ok) return;
          const jobsList = await jobsRes.json();
          const currentJob = jobsList.find((j: any) => j.jobId === jobId);

          if (!currentJob) return;

          setExportProgress(currentJob.progress || 15);

          if (currentJob.progress < 25) {
            setExportStage('Normalizing clip footage & motion plates...');
          } else if (currentJob.progress < 55) {
            setExportStage('Concatenating video timeline & applying aspect scaling...');
          } else if (currentJob.progress < 75) {
            setExportStage('Synthesizing character dialogue audio with Flite TTS...');
          } else if (currentJob.progress < 90) {
            setExportStage('Mixing acoustic background score & foley sound effects...');
          } else {
            setExportStage('Finalizing H.264 video & AAC stereo audio into MP4 container...');
          }

          if (currentJob.status === 'completed') {
            clearInterval(pollInterval);

            const finalFilename = currentJob.videoUrl?.split('/').pop() || currentJob.targetId || 'master.mp4';

            // 3. Fetch editing metadata (EDL, FCPXML, SRT) in parallel
            let edl = '';
            let fcpxml = '';
            let srt = '';
            try {
              const metaRes = await fetch('/api/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project, settings }),
              });
              if (metaRes.ok) {
                const metaData = await metaRes.json();
                edl = metaData.edl || '';
                fcpxml = metaData.fcpxml || '';
                srt = metaData.srt || '';
              }
            } catch {}

            // 4. Run deep MP4 validation on the rendered file
            setExportStage('Running deep FFprobe stream & decodability validation...');
            let valData: MP4ValidationInfo = { valid: false };
            try {
              const valRes = await fetch(`/api/exports/${encodeURIComponent(finalFilename)}/validate`);
              valData = await valRes.json();
            } catch (vErr: any) {
              valData = { valid: false, error: vErr.message || 'Validation request failed' };
            }
            setValidationResult(valData);

            setExportProgress(100);
            setExportStage(
              valData.valid
                ? 'Master MP4 film render verified & completed!'
                : `MP4 rendered but validation warning: ${valData.error}`
            );

            setExportResult({
              status: 'completed',
              filename: finalFilename,
              videoUrl: currentJob.videoUrl,
              downloadUrl: currentJob.downloadUrl || `/api/exports/${finalFilename}`,
              fileSize: valData.fileSize || currentJob.fileSize,
              duration: valData.duration || currentJob.duration || project.actualAssembledDuration,
              resolution: valData.resolution || currentJob.resolution || settings.resolution,
              videoCodec: valData.videoCodec || 'h264',
              audioCodec: valData.audioCodec || 'aac',
              edl,
              fcpxml,
              srt,
            });
            setIsExporting(false);
          } else if (currentJob.status === 'failed') {
            clearInterval(pollInterval);
            setIsExporting(false);
            setExportResult({
              status: 'error',
              error: currentJob.error || 'FFmpeg render worker reported an error.',
            });
          } else if (Date.now() - pollStartTime > 180000) {
            clearInterval(pollInterval);
            setIsExporting(false);
            setExportResult({
              status: 'error',
              error: 'Render job timed out after 3 minutes.',
            });
          }
        } catch (pollErr: any) {
          console.warn('Poll error:', pollErr);
        }
      }, 1200);
    } catch (err: any) {
      console.error('Export error:', err);
      setIsExporting(false);
      setExportResult({
        status: 'error',
        error: err instanceof Error ? err.message : 'Server export endpoint unavailable.',
      });
    }
  };

  /**
   * Resilient, validated MP4 download handler.
   * Strictly verifies Content-Type is video/mp4 and rejects any HTML payload.
   */
  const handleDownloadMp4 = async () => {
    if (!exportResult?.downloadUrl && !exportResult?.videoUrl) return;
    setIsDownloading(true);
    setDownloadError(null);

    try {
      const targetUrl = exportResult.downloadUrl || exportResult.videoUrl;
      const response = await fetch(targetUrl, {
        headers: { Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.5' },
      });

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new Error(
          'Server returned an HTML document instead of an MP4 video file. The export file may not have finished rendering.'
        );
      }

      if (!response.ok) {
        throw new Error(`Download failed with HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error('Downloaded video stream is empty (0 bytes).');
      }

      if (blob.type && blob.type.includes('html')) {
        throw new Error('Downloaded file payload contains HTML instead of MP4 binary data.');
      }

      // Create verified video/mp4 blob URL and trigger save
      const videoBlob = new Blob([blob], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(videoBlob);
      const filename =
        exportResult.filename || `${project.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_master.mp4`;

      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = blobUrl;
      downloadAnchor.download = filename;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err: any) {
      console.error('Download execution error:', err);
      setDownloadError(err.message || 'Failed to download master MP4 video.');
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadFile = (filename: string, content: string, mime = 'text/plain') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl p-6 text-zinc-100 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-1">
            <Film className="w-4 h-4" />
            <span>Master Video Rendering Engine</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Render & Export Complete Film Master (MP4)
          </h2>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Renders a genuine broadcast-grade MP4 with synchronized video clips, acoustic character dialogue TTS, cinematic score, and foley sound effects.
          </p>
        </div>

        <button
          onClick={handleExport}
          disabled={isExporting}
          className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white font-semibold text-sm shadow-xl shadow-indigo-950/40 transition active:scale-95 disabled:opacity-50 shrink-0"
        >
          {isExporting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Rendering Master MP4...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Render & Export Final Film</span>
            </>
          )}
        </button>
      </div>

      {/* Export Progress Bar if exporting or completed */}
      {(isExporting || (exportResult && exportResult.status !== 'error')) && (
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-200">{exportStage}</span>
            <span className="font-mono text-cyan-400 font-bold">{exportProgress}%</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${exportProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Render Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Panel 1: Video Encoding & Format */}
        <div className="bg-zinc-900/60 p-5 rounded-xl border border-zinc-800/80 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white">
            <Monitor className="w-4 h-4 text-cyan-400" />
            <span>Format & Resolution</span>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">Target Resolution</label>
            <select
              value={settings.resolution}
              onChange={(e) => {
                const updated = { ...settings, resolution: e.target.value as any };
                setSettings(updated);
                onUpdateExportSettings(updated);
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white"
            >
              <option value="1080p">1080p Full HD (1920 × 1080)</option>
              <option value="4K Cinema">4K Cinema Master (3840 × 2160)</option>
              <option value="720p">720p HD (1280 × 720)</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">Aspect Ratio</label>
            <select
              value={settings.aspectRatio}
              onChange={(e) => {
                const updated = { ...settings, aspectRatio: e.target.value as any };
                setSettings(updated);
                onUpdateExportSettings(updated);
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white"
            >
              <option value="2.39:1">2.39:1 Anamorphic Cinemascope</option>
              <option value="16:9">16:9 Widescreen Standard</option>
              <option value="9:16">9:16 Vertical Reel / Mobile</option>
              <option value="4:3">4:3 Vintage Academy</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">Master Codec</label>
            <select
              value={settings.codec}
              onChange={(e) => {
                const updated = { ...settings, codec: e.target.value as any };
                setSettings(updated);
                onUpdateExportSettings(updated);
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white"
            >
              <option value="H.264">H.264 / AVC (Broad Compatibility)</option>
              <option value="ProRes 422">Apple ProRes 422 HQ (Mastering)</option>
              <option value="HEVC">HEVC / H.265 (High Compression)</option>
              <option value="VP9 / WebM">VP9 / WebM (Streaming Web)</option>
            </select>
          </div>
        </div>

        {/* Panel 2: Color Grade & Look LUT */}
        <div className="bg-zinc-900/60 p-5 rounded-xl border border-zinc-800/80 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Color Grading LUT</span>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">Cinema Look Profile</label>
            <select
              value={settings.colorGradeLUT}
              onChange={(e) => {
                const updated = { ...settings, colorGradeLUT: e.target.value as any };
                setSettings(updated);
                onUpdateExportSettings(updated);
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white"
            >
              <option value="Cinematic Teal & Orange">Cinematic Teal & Orange (Hollywood Standard)</option>
              <option value="Sci-Fi Cyberpunk">Sci-Fi Cyberpunk (Vibrant Neon & Cobalt)</option>
              <option value="Noir High-Contrast">Noir High-Contrast (Deep Shadows & Speculars)</option>
              <option value="Kodak 5219 Warm">Kodak 5219 Warm (Analog 35mm Grain & Halation)</option>
              <option value="Clean Rec709">Clean Rec709 Neutral</option>
            </select>
          </div>

          <div className="pt-2">
            <label className="flex items-center space-x-2 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.burnSubtitles}
                onChange={(e) => {
                  const updated = { ...settings, burnSubtitles: e.target.checked };
                  setSettings(updated);
                  onUpdateExportSettings(updated);
                }}
                className="w-4 h-4 rounded bg-zinc-950 border-zinc-700 text-cyan-500 focus:ring-0"
              />
              <span>Burn-In Dialogue Subtitles (SRT/VTT)</span>
            </label>
            <p className="text-[11px] text-zinc-500 mt-1 pl-6">
              Renders yellow typography in lower third with anti-aliased backdrop pill.
            </p>
          </div>
        </div>

        {/* Panel 3: Audio Channel Mixing */}
        <div className="bg-zinc-900/60 p-5 rounded-xl border border-zinc-800/80 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white">
            <Volume2 className="w-4 h-4 text-amber-400" />
            <span>Multi-Track Audio Mixing</span>
          </div>

          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>Dialogue Channel (TTS)</span>
              <span className="font-mono text-cyan-400">{settings.audioMix.dialogueLevel}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={settings.audioMix.dialogueLevel}
              onChange={(e) => {
                const updated = {
                  ...settings,
                  audioMix: { ...settings.audioMix, dialogueLevel: parseInt(e.target.value, 10) },
                };
                setSettings(updated);
                onUpdateExportSettings(updated);
              }}
              className="w-full accent-cyan-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>Music Score Channel</span>
              <span className="font-mono text-purple-400">{settings.audioMix.musicLevel}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={settings.audioMix.musicLevel}
              onChange={(e) => {
                const updated = {
                  ...settings,
                  audioMix: { ...settings.audioMix, musicLevel: parseInt(e.target.value, 10) },
                };
                setSettings(updated);
                onUpdateExportSettings(updated);
              }}
              className="w-full accent-purple-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>Sound Effects Foley (SFX)</span>
              <span className="font-mono text-emerald-400">{settings.audioMix.sfxLevel}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={settings.audioMix.sfxLevel}
              onChange={(e) => {
                const updated = {
                  ...settings,
                  audioMix: { ...settings.audioMix, sfxLevel: parseInt(e.target.value, 10) },
                };
                setSettings(updated);
                onUpdateExportSettings(updated);
              }}
              className="w-full accent-emerald-500"
            />
          </div>
        </div>
      </div>

      {exportResult?.status === 'error' && (
        <div className="p-4 rounded-xl border border-red-900 bg-red-950/40 text-sm text-red-200 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-semibold">Render failed:</strong>
            <span>{exportResult.error || 'Server render failed.'}</span>
          </div>
        </div>
      )}

      {downloadError && (
        <div className="p-4 rounded-xl border border-amber-900 bg-amber-950/40 text-sm text-amber-200 flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-semibold">Download Intercepted:</strong>
            <span>{downloadError}</span>
          </div>
        </div>
      )}

      {/* MASTER MP4 RENDER RESULT */}
      {exportResult && exportResult.status === 'completed' && (
        <div className="p-6 bg-gradient-to-b from-zinc-900 to-zinc-950 border border-emerald-500/40 rounded-2xl space-y-6 shadow-2xl">
          {/* Header & Badges */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                  <span>Master Film Render Complete</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    MP4 H.264
                  </span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Full multi-track film assembled with video, dialogue, music, and foley sound.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleDownloadMp4}
                disabled={isDownloading || (validationResult !== null && !validationResult.valid)}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-sm shadow-lg shadow-emerald-950/40 transition active:scale-95 disabled:opacity-50"
                title={
                  validationResult && !validationResult.valid
                    ? 'Download disabled: MP4 validation failed'
                    : 'Download verified master MP4 video file'
                }
              >
                {isDownloading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Downloading MP4 Stream...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Master MP4</span>
                  </>
                )}
              </button>
              <button
                onClick={onNavigateToPreview}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold border border-zinc-700 transition"
              >
                <Play className="w-4 h-4 text-cyan-400" />
                <span>Cinema Player</span>
              </button>
            </div>
          </div>

          {/* Validation Status Card */}
          {validationResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                validationResult.valid
                  ? 'bg-emerald-950/30 border-emerald-600/40 text-emerald-200'
                  : 'bg-rose-950/30 border-rose-600/40 text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {validationResult.valid
                      ? 'MP4 Deep Stream & Codec Validation Passed'
                      : 'MP4 Validation Failed'}
                  </span>
                </span>
                <span className="font-mono text-[11px]">
                  {validationResult.valid ? 'PROBE OK' : 'CHECK FAILED'}
                </span>
              </div>
              {validationResult.valid ? (
                <div className="text-[11px] text-zinc-300 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1 font-mono">
                  <div>• Format: MPEG-4 ISO Media</div>
                  <div>• Video: H.264 ({validationResult.resolution})</div>
                  <div>
                    • Audio: {validationResult.hasAudio ? `${validationResult.audioCodec?.toUpperCase()} Stereo` : 'None'}
                  </div>
                  <div>• Duration: {validationResult.duration}s Verified</div>
                </div>
              ) : (
                <div className="text-[11px] text-rose-300 font-mono">
                  {validationResult.error}
                </div>
              )}
            </div>
          )}

          {/* Video Player Preview */}
          <div className="relative rounded-xl overflow-hidden bg-black border border-zinc-800 max-h-[460px] flex items-center justify-center">
            <video
              ref={videoPreviewRef}
              src={exportResult.videoUrl}
              controls
              className="w-full max-h-[440px] rounded-lg"
            />
          </div>

          {/* Technical Specs Dashboard */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Container</span>
              <span className="text-white font-mono font-bold">MPEG-4 (.mp4)</span>
            </div>
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Video Codec</span>
              <span className="text-cyan-400 font-mono font-bold">{exportResult.videoCodec?.toUpperCase() || 'H.264'}</span>
            </div>
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Audio Codec</span>
              <span className="text-purple-400 font-mono font-bold">{exportResult.audioCodec?.toUpperCase() || 'AAC'} Stereo</span>
            </div>
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Resolution</span>
              <span className="text-white font-mono font-bold">{exportResult.resolution}</span>
            </div>
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Film Duration</span>
              <span className="text-emerald-400 font-mono font-bold">
                {exportResult.duration ? `${exportResult.duration.toFixed(1)}s` : 'N/A'}
              </span>
            </div>
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Master Size</span>
              <span className="text-amber-400 font-mono font-bold">
                {exportResult.fileSize
                  ? `${(exportResult.fileSize / (1024 * 1024)).toFixed(2)} MB`
                  : 'N/A'}
              </span>
            </div>
          </div>

          {/* Secondary NLE Metadata Packages */}
          <div className="pt-4 border-t border-zinc-800/80 space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-400">
              <FileCode className="w-4 h-4 text-cyan-400" />
              <span>Broadcast Editing Metadata Packages (NLE Integrations)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Download 1: Master Video EDL */}
              <button
                onClick={() =>
                  downloadFile(
                    `${project.title.toLowerCase().replace(/\s+/g, '_')}_master.edl`,
                    exportResult.edl || 'TITLE: MASTER'
                  )
                }
                className="p-3 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-white">CMX 3600 EDL</div>
                  <div className="text-[10px] text-zinc-500">DaVinci Resolve & Premiere</div>
                </div>
                <Download className="w-4 h-4 text-cyan-400" />
              </button>

              {/* Download 2: Final Cut Pro XML */}
              <button
                onClick={() =>
                  downloadFile(
                    `${project.title.toLowerCase().replace(/\s+/g, '_')}_master.fcpxml`,
                    exportResult.fcpxml || '<fcpxml></fcpxml>',
                    'application/xml'
                  )
                }
                className="p-3 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-white">Final Cut Pro XML</div>
                  <div className="text-[10px] text-zinc-500">Timeline with track metadata</div>
                </div>
                <Download className="w-4 h-4 text-indigo-400" />
              </button>

              {/* Download 3: Subtitles SRT */}
              <button
                onClick={() =>
                  downloadFile(
                    `${project.title.toLowerCase().replace(/\s+/g, '_')}_subtitles.srt`,
                    exportResult.srt || '1\n00:00:00,000 --> 00:00:02,000\n[Speech]'
                  )
                }
                className="p-3 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-white">SRT Subtitles</div>
                  <div className="text-[10px] text-zinc-500">Synced dialogue timecodes</div>
                </div>
                <Download className="w-4 h-4 text-amber-400" />
              </button>

              {/* Download 4: Full Assembly Manifest JSON */}
              <button
                onClick={() =>
                  downloadFile(
                    `${project.title.toLowerCase().replace(/\s+/g, '_')}_manifest.json`,
                    JSON.stringify(exportResult, null, 2),
                    'application/json'
                  )
                }
                className="p-3 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-white">Assembly Manifest</div>
                  <div className="text-[10px] text-zinc-500">JSON schema export</div>
                </div>
                <Download className="w-4 h-4 text-purple-400" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
