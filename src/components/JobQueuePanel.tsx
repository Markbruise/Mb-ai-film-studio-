import React, { useRef, useState } from 'react';
import {
  FilmProject,
  GenerationJob,
  VideoClip,
  ProviderId,
  PROVIDER_SPECS,
  TimelineAccessStatus,
} from '../types/film';
import {
  Cpu,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertOctagon,
  Layers,
  Sparkles,
  Zap,
  Film,
  Download,
  Lock,
  Unlock,
  Upload,
  Image as ImageIcon,
  AlertTriangle,
  Video,
  Users,
} from 'lucide-react';
import { formatDurationNice } from '../utils/timecode';

interface JobQueuePanelProps {
  project: FilmProject;
  jobs: GenerationJob[];
  timelineAccess: TimelineAccessStatus;
  onGenerateAllRemaining: () => void;
  onGenerateSingleClip: (clipId: string, overrides?: Partial<VideoClip>) => void;
  onUploadClipVideo: (clipId: string, file: File) => Promise<void>;
  onUpdateClipConfig: (clipId: string, patch: Partial<VideoClip>) => void;
  onRetryFailed: () => void;
  onRetrySingleJob: (jobId: string) => void;
  onAssembleTimeline: () => void;
  onNavigateToTimeline: () => void;
  onNavigateToStoryboard: () => void;
  onNavigateToPreview: () => void;
  onNavigateToExport: () => void;
  isGeneratingBatch: boolean;
}

export const JobQueuePanel: React.FC<JobQueuePanelProps> = ({
  project,
  jobs,
  timelineAccess,
  onGenerateAllRemaining,
  onGenerateSingleClip,
  onUploadClipVideo,
  onUpdateClipConfig,
  onRetryFailed,
  onRetrySingleJob,
  onAssembleTimeline,
  onNavigateToTimeline,
  onNavigateToStoryboard,
  onNavigateToPreview,
  onNavigateToExport,
  isGeneratingBatch,
}) => {
  const [uploadingClipId, setUploadingClipId] = useState<string | null>(null);
  const [expandedClipId, setExpandedClipId] = useState<string | null>(project.clips[0]?.clipId || null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeUploadClipIdRef = useRef<string | null>(null);

  const totalClips = project.clips.length;
  const completedClips = project.clips.filter(
    (c) => c.generationStatus === 'completed' && c.videoUrl && !c.videoUrl.startsWith('procedural://')
  ).length;
  const pendingClips = project.clips.filter(
    (c) => c.generationStatus === 'queued' || c.generationStatus === 'generating'
  ).length;
  const failedClips = project.clips.filter((c) => c.generationStatus === 'failed').length;
  const overallProgress = totalClips > 0 ? Math.round((completedClips / totalClips) * 100) : 0;

  const approvedFrames = (project.storyboardFrames || []).filter((f) => f.approvalStatus === 'approved').length;
  const totalFrames = (project.storyboardFrames || []).length;
  const storyboardReady = totalFrames === 0 || approvedFrames === totalFrames || Boolean(project.storyboardApproved);

  const triggerUploadForClip = (clipId: string) => {
    activeUploadClipIdRef.current = clipId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetClipId = activeUploadClipIdRef.current;
    if (!file || !targetClipId) return;
    setUploadingClipId(targetClipId);
    try {
      await onUploadClipVideo(targetClipId, file);
    } finally {
      setUploadingClipId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleKeyframeFileUpload = (clipId: string, field: 'firstFrameImage' | 'lastFrameImage', file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateClipConfig(clipId, { [field]: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl p-5 sm:p-6 text-zinc-100 space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 uppercase tracking-widest mb-1">
            <Cpu className="w-4 h-4" />
            <span>Stage 5 — AI Video Production Center</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Shot Video Generation & Strict Timeline Gate
          </h2>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Generate each shot using Text-to-Video, Image-to-Video, or Keyframe Interpolation with consistent characters, or upload custom MP4 footage. All clips must verify before the Timeline Editor unlocks.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {pendingClips > 0 && (
            <button
              onClick={onGenerateAllRemaining}
              disabled={isGeneratingBatch || !storyboardReady}
              title={!storyboardReady ? 'Approve storyboard frames first before batch generation' : 'Queue generation for all incomplete clips'}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg transition active:scale-95 disabled:opacity-40"
            >
              {isGeneratingBatch ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              <span>Generate Remaining ({pendingClips})</span>
            </button>
          )}

          {failedClips > 0 && (
            <button
              onClick={onRetryFailed}
              className="flex items-center space-x-2 px-3.5 py-2.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-200 font-semibold text-xs transition active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Failed ({failedClips})</span>
            </button>
          )}

          <button
            onClick={onAssembleTimeline}
            className="flex items-center space-x-2 px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs border border-zinc-700 transition"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sync Durations</span>
          </button>

          <button
            onClick={onNavigateToTimeline}
            disabled={!timelineAccess.unlocked}
            className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              timelineAccess.unlocked
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40'
                : 'bg-zinc-900 text-zinc-500 border border-zinc-800 cursor-not-allowed'
            }`}
          >
            {timelineAccess.unlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            <span>Open Timeline Editor</span>
          </button>

          <button
            onClick={onNavigateToPreview}
            className="flex items-center space-x-1.5 px-3 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs border border-zinc-800 transition"
          >
            <Play className="w-3.5 h-3.5 text-indigo-400" />
            <span>Preview</span>
          </button>

          <button
            onClick={onNavigateToExport}
            className="flex items-center space-x-1.5 px-3 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs border border-zinc-800 transition"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Storyboard Approval Gate Banner */}
      {!storyboardReady && (
        <div className="p-4 rounded-xl bg-amber-950/35 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-amber-200">
                Storyboard Approval Recommended ({approvedFrames}/{totalFrames} frames approved)
              </div>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Batch video generation is held until your storyboard frames are approved so shots lock camera angles and visual continuity before cloud synthesis.
              </p>
            </div>
          </div>
          <button
            onClick={onNavigateToStoryboard}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shrink-0 transition"
          >
            Review Storyboard
          </button>
        </div>
      )}

      {/* Strict Timeline Lock Status Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          timelineAccess.unlocked
            ? 'bg-emerald-950/25 border-emerald-500/40'
            : 'bg-zinc-900/90 border-amber-500/30'
        }`}
      >
        <div className="flex items-start space-x-3">
          <div
            className={`p-2 rounded-lg border shrink-0 ${
              timelineAccess.unlocked
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
            }`}
          >
            {timelineAccess.unlocked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <div className="text-sm font-bold text-white">
              {timelineAccess.unlocked
                ? `Timeline Editor Unlocked (${timelineAccess.readyClips}/${timelineAccess.totalClips} Verified Video Clips)`
                : `Timeline Editor Locked (${timelineAccess.readyClips}/${timelineAccess.totalClips} Clips Verified)`}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              {timelineAccess.unlocked
                ? 'Every clip has a verified real MP4 video asset. You can now edit timing, transitions, and multi-track sound on the Timeline Editor.'
                : `${timelineAccess.blockedClips.length} clip(s) still require completed AI generation or custom MP4 footage upload before Timeline assembly opens.`}
            </p>
          </div>
        </div>

        {timelineAccess.unlocked ? (
          <button
            onClick={onNavigateToTimeline}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shrink-0 transition"
          >
            Enter Timeline Editor
          </button>
        ) : (
          <div className="text-[11px] font-mono text-amber-300 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800 shrink-0">
            Waiting on {timelineAccess.blockedClips.length} clip(s)
          </div>
        )}
      </div>

      {/* Film Progress Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Overall Video Readiness
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold font-mono text-cyan-400 tabular-nums">{overallProgress}%</span>
            <span className="text-xs text-zinc-400 font-sans">
              ({completedClips}/{totalClips} verified)
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Assembled Runtime
          </div>
          <div className="text-3xl font-extrabold font-mono text-white tabular-nums">
            {formatDurationNice(project.actualAssembledDuration)}
          </div>
          <div className="text-xs text-zinc-400">
            Target: <strong className="text-zinc-200">{formatDurationNice(project.targetDurationSeconds)}</strong>
          </div>
        </div>

        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Default Video Engine
          </div>
          <div className="text-lg font-bold text-white truncate">
            {PROVIDER_SPECS[project.defaultProvider]?.name || 'Google Gemini Omni Flash'}
          </div>
          <div className="text-xs text-zinc-400">
            Clip limit: <strong className="text-cyan-400">{PROVIDER_SPECS[project.defaultProvider]?.maxClipDuration || 15}s</strong>
          </div>
        </div>

        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Production Queue
          </div>
          <div className="flex items-center space-x-3 text-xs">
            <span className="flex items-center space-x-1 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{completedClips} Ready</span>
            </span>
            <span className="flex items-center space-x-1 text-amber-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>{pendingClips} Pending</span>
            </span>
            {failedClips > 0 && (
              <span className="flex items-center space-x-1 text-rose-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>{failedClips} Failed</span>
              </span>
            )}
          </div>
          <div className="text-[11px] text-zinc-500">
            Completed clips never downgrade when other shots fail.
          </div>
        </div>
      </div>

      {/* Per-Clip Studio Production Workstation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <Video className="w-4 h-4 text-cyan-400" />
            <span>Shot-by-Shot Video Generation Studio ({project.clips.length} Clips)</span>
          </h3>
          <span className="text-[11px] text-zinc-500 font-mono">
            Supports Text-to-Video, Image-to-Video & Keyframe Interpolation
          </span>
        </div>

        <div className="space-y-3">
          {project.clips.map((clip, idx) => {
            const shot = project.shots.find((s) => s.shotId === clip.shotId);
            const scene = project.scenes.find((sc) => sc.sceneId === clip.sceneId);
            const storyboardFrame = (project.storyboardFrames || []).find((f) => f.shotId === clip.shotId);
            const isExpanded = expandedClipId === clip.clipId;
            const hasRealVideo =
              clip.generationStatus === 'completed' &&
              Boolean(clip.videoUrl) &&
              !clip.videoUrl.startsWith('procedural://');
            const mode = clip.generationMode || (clip.firstFrameImage ? 'image-to-video' : 'text-to-video');
            const matchedCharacters = (project.characterProfiles || []).filter(
              (ch) =>
                clip.characterReferences?.includes(ch.name) ||
                shot?.characters?.includes(ch.name)
            );

            return (
              <div
                key={clip.clipId}
                className={`rounded-xl border transition ${
                  hasRealVideo
                    ? 'bg-zinc-900/50 border-emerald-500/30'
                    : clip.generationStatus === 'failed'
                    ? 'bg-rose-950/15 border-rose-500/40'
                    : 'bg-zinc-900/70 border-zinc-800'
                }`}
              >
                {/* Summary Row */}
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div
                    onClick={() => setExpandedClipId(isExpanded ? null : clip.clipId)}
                    className="flex items-start space-x-3 cursor-pointer flex-1 min-w-0"
                  >
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono font-bold text-cyan-400 shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-white truncate">
                          Scene {scene?.sceneNumber || 1} • Shot {shot?.shotNumber || 1}: {shot?.title || clip.clipId}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-950 border border-zinc-800 text-zinc-300">
                          {clip.duration.toFixed(1)}s
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                            hasRealVideo
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : clip.generationStatus === 'generating'
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : clip.generationStatus === 'failed'
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          {hasRealVideo ? 'Verified Ready' : clip.generationStatus}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-1">{clip.prompt}</p>
                    </div>
                  </div>

                  {/* Quick Clip Controls */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandedClipId(isExpanded ? null : clip.clipId)}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition"
                    >
                      {isExpanded ? 'Hide Studio' : 'Configure Shot'}
                    </button>

                    <button
                      type="button"
                      onClick={() => triggerUploadForClip(clip.clipId)}
                      disabled={uploadingClipId === clip.clipId}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 transition disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{uploadingClipId === clip.clipId ? 'Uploading...' : 'Upload MP4'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onGenerateSingleClip(clip.clipId, {
                          generationMode: mode,
                          firstFrameImage: clip.firstFrameImage || storyboardFrame?.imageUrl,
                        })
                      }
                      disabled={clip.generationStatus === 'generating'}
                      className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {clip.generationStatus === 'generating'
                          ? 'Generating...'
                          : hasRealVideo
                          ? 'Regenerate'
                          : 'Generate AI Video'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Error Readout if Failed */}
                {clip.error && (
                  <div className="mx-4 mb-3 p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 font-mono break-words">
                    <strong className="text-rose-300">Provider Error:</strong> {clip.error}
                  </div>
                )}

                {/* Expanded Shot Studio Controls */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 border-t border-zinc-800/80 grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Left Config */}
                    <div className="lg:col-span-7 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">Generation Mode</label>
                          <select
                            value={mode}
                            onChange={(e) =>
                              onUpdateClipConfig(clip.clipId, {
                                generationMode: e.target.value as any,
                              })
                            }
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white"
                          >
                            <option value="text-to-video">Text-to-Video</option>
                            <option value="image-to-video">Image-to-Video</option>
                            <option value="keyframe-interpolation">Start/End Keyframes</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">AI Provider</label>
                          <select
                            value={clip.provider}
                            onChange={(e) =>
                              onUpdateClipConfig(clip.clipId, {
                                provider: e.target.value as ProviderId,
                              })
                            }
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white"
                          >
                            <option value="gemini-omni">Gemini Omni Flash</option>
                            <option value="veo3">Google Veo 3.1 (Vertex)</option>
                            <option value="veo2">Google Veo 2 (Vertex)</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">Clip Resolution</label>
                          <select
                            value={clip.resolution || project.resolution || '1080p'}
                            onChange={(e) =>
                              onUpdateClipConfig(clip.clipId, { resolution: e.target.value })
                            }
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white"
                          >
                            <option value="720p">720p HD</option>
                            <option value="1080p">1080p Full HD</option>
                            <option value="4K Cinema">4K Cinema</option>
                          </select>
                        </div>
                      </div>

                      {/* Prompt Editor */}
                      <div>
                        <label className="text-[11px] text-zinc-400 block mb-1">
                          Cinematography & Visual Prompt
                        </label>
                        <textarea
                          value={clip.prompt}
                          onChange={(e) =>
                            onUpdateClipConfig(clip.clipId, { prompt: e.target.value })
                          }
                          rows={3}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      {/* Character Consistency Badges */}
                      {matchedCharacters.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="flex items-center space-x-1 text-zinc-400">
                            <Users className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Locked Character Refs:</span>
                          </span>
                          {matchedCharacters.map((ch) => (
                            <span
                              key={ch.id}
                              className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-200"
                            >
                              {ch.referenceImageUrl && (
                                <img
                                  src={ch.referenceImageUrl}
                                  alt={ch.name}
                                  className="w-4 h-4 rounded-full object-cover"
                                />
                              )}
                              <span>{ch.name}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Keyframe Image Attachments for Image-to-Video / Interpolation */}
                      {mode !== 'text-to-video' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-zinc-300 font-semibold flex items-center space-x-1">
                                <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                                <span>First Frame Reference</span>
                              </span>
                              {storyboardFrame?.imageUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateClipConfig(clip.clipId, {
                                      firstFrameImage: storyboardFrame.imageUrl,
                                    })
                                  }
                                  className="text-[10px] text-cyan-400 hover:underline"
                                >
                                  Use Storyboard
                                </button>
                              )}
                            </div>
                            {(clip.firstFrameImage || storyboardFrame?.imageUrl) && (
                              <img
                                src={clip.firstFrameImage || storyboardFrame?.imageUrl}
                                alt="First keyframe"
                                className="w-full h-24 object-cover rounded border border-zinc-800"
                              />
                            )}
                            <label className="block text-center py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 cursor-pointer">
                              Upload Start Frame
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleKeyframeFileUpload(clip.clipId, 'firstFrameImage', f);
                                }}
                              />
                            </label>
                          </div>

                          {mode === 'keyframe-interpolation' && (
                            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-zinc-300 font-semibold flex items-center space-x-1">
                                  <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                                  <span>Last Frame Target</span>
                                </span>
                              </div>
                              {clip.lastFrameImage && (
                                <img
                                  src={clip.lastFrameImage}
                                  alt="Last keyframe"
                                  className="w-full h-24 object-cover rounded border border-zinc-800"
                                />
                              )}
                              <label className="block text-center py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-300 cursor-pointer">
                                Upload End Frame
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleKeyframeFileUpload(clip.clipId, 'lastFrameImage', f);
                                  }}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right Video Monitor */}
                    <div className="lg:col-span-5 bg-zinc-950 rounded-xl border border-zinc-800 p-3 flex flex-col justify-between space-y-2">
                      <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between">
                        <span>Generated Video Monitor</span>
                        <span>{hasRealVideo ? 'MP4 Verified' : 'Awaiting Render'}</span>
                      </div>

                      {hasRealVideo ? (
                        <video
                          src={clip.videoUrl}
                          controls
                          playsInline
                          className="w-full aspect-video rounded-lg bg-black border border-zinc-800"
                        />
                      ) : (
                        <div className="w-full aspect-video rounded-lg bg-zinc-900/70 border border-dashed border-zinc-800 flex flex-col items-center justify-center text-center p-4 space-y-2">
                          <Film className="w-8 h-8 text-zinc-600" />
                          <div className="text-xs font-semibold text-zinc-300">
                            No verified video footage yet
                          </div>
                          <p className="text-[11px] text-zinc-500 max-w-xs">
                            Generate with {PROVIDER_SPECS[clip.provider]?.name || clip.provider} or upload a real MP4/WebM clip to unlock timeline editing for this shot.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Asynchronous Jobs Feed */}
      <div className="space-y-3 pt-2 border-t border-zinc-800">
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          <span>Asynchronous Render Jobs ({jobs.length})</span>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {jobs.length === 0 ? (
            <div className="p-4 bg-zinc-900/40 rounded-lg border border-zinc-800 text-center text-xs text-zinc-500">
              No active queue jobs yet. Generate a shot above or click "Generate Remaining".
            </div>
          ) : (
            jobs.map((job) => (
              <div
                key={job.jobId}
                className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <span
                    className={`p-1.5 rounded-md shrink-0 ${
                      job.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : job.status === 'processing'
                        ? 'bg-amber-500/10 text-amber-400 animate-spin'
                        : job.status === 'failed'
                        ? 'bg-rose-500/10 text-rose-400'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {job.status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : job.status === 'failed' ? (
                      <AlertOctagon className="w-4 h-4" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </span>

                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">{job.title}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      Job ID: {job.jobId} • Retries: {job.retryCount}
                    </div>
                    {job.error && (
                      <div className="mt-1 text-[11px] text-rose-300 bg-rose-950/60 p-1.5 rounded border border-rose-800/60 max-w-xl break-words">
                        {job.error}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <div className="text-right">
                    <span
                      className={`capitalize font-semibold ${
                        job.status === 'completed'
                          ? 'text-emerald-400'
                          : job.status === 'processing'
                          ? 'text-amber-400'
                          : job.status === 'failed'
                          ? 'text-rose-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {job.status}
                    </span>
                    <div className="text-[10px] text-zinc-500 font-mono">{job.progress}%</div>
                  </div>

                  {job.status === 'processing' && (
                    <button
                      onClick={async () => {
                        try {
                          await fetch(`/api/jobs/${job.jobId}/cancel`, { method: 'POST' });
                        } catch {}
                      }}
                      className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 hover:text-white border border-zinc-700 transition"
                    >
                      Cancel
                    </button>
                  )}

                  {job.status === 'failed' && (
                    <button
                      onClick={() => onRetrySingleJob(job.jobId)}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 transition"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
