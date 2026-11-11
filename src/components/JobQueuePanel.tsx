import React from 'react';
import { FilmProject, GenerationJob, VideoClip, PROVIDER_SPECS } from '../types/film';
import {
  Cpu,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertOctagon,
  Clock,
  Layers,
  Sparkles,
  Zap,
  Film,
  Download,
} from 'lucide-react';
import { formatDurationNice } from '../utils/timecode';

interface JobQueuePanelProps {
  project: FilmProject;
  jobs: GenerationJob[];
  onGenerateAllRemaining: () => void;
  onRetryFailed: () => void;
  onRetrySingleJob: (jobId: string) => void;
  onAssembleTimeline: () => void;
  onNavigateToPreview: () => void;
  onNavigateToExport: () => void;
  isGeneratingBatch: boolean;
}

export const JobQueuePanel: React.FC<JobQueuePanelProps> = ({
  project,
  jobs,
  onGenerateAllRemaining,
  onRetryFailed,
  onRetrySingleJob,
  onAssembleTimeline,
  onNavigateToPreview,
  onNavigateToExport,
  isGeneratingBatch,
}) => {
  const totalClips = project.clips.length;
  const completedClips = project.clips.filter((c) => c.generationStatus === 'completed').length;
  const pendingClips = project.clips.filter((c) => c.generationStatus === 'queued' || c.generationStatus === 'generating').length;
  const failedClips = project.clips.filter((c) => c.generationStatus === 'failed').length;

  const overallProgress = totalClips > 0 ? Math.round((completedClips / totalClips) * 100) : 0;

  return (
    <div className="bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl p-6 text-zinc-100 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-1">
            <Cpu className="w-4 h-4" />
            <span>Asynchronous Generative Pipeline</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Job Queue & Automatic Assembly Monitor
          </h2>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Manages asynchronous clip rendering across distributed AI providers. Preserves completed clips during retries and avoids duplicate generation jobs.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {pendingClips > 0 && (
            <button
              onClick={onGenerateAllRemaining}
              disabled={isGeneratingBatch}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg transition active:scale-95 disabled:opacity-50"
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
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-200 font-semibold text-xs transition active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Failed ({failedClips})</span>
            </button>
          )}

          <button
            onClick={onAssembleTimeline}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs border border-zinc-700 transition"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sync & Assemble Timeline</span>
          </button>

          <button
            onClick={onNavigateToPreview}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs border border-zinc-800 transition"
          >
            <Play className="w-3.5 h-3.5 text-indigo-400" />
            <span>Preview Film</span>
          </button>

          <button
            onClick={onNavigateToExport}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs border border-zinc-800 transition"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export Center</span>
          </button>
        </div>
      </div>

      {/* Film Progress Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Overall Progress */}
        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Overall Film Progress
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold font-mono text-cyan-400">{overallProgress}%</span>
            <span className="text-xs text-zinc-400 font-sans">
              ({completedClips}/{totalClips} clips)
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        {/* Card 2: Assembled Duration */}
        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Assembled Runtime
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold font-mono text-white">
              {formatDurationNice(project.actualAssembledDuration)}
            </span>
          </div>
          <div className="text-xs text-zinc-400">
            Target: <strong className="text-zinc-200">{formatDurationNice(project.targetDurationSeconds)}</strong>
          </div>
        </div>

        {/* Card 3: Active Provider */}
        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            AI Video Provider
          </div>
          <div className="text-lg font-bold text-white truncate">
            {PROVIDER_SPECS[project.defaultProvider]?.name || 'Google Veo 2'}
          </div>
          <div className="text-xs text-zinc-400">
            Max clip limit: <strong className="text-cyan-400">{PROVIDER_SPECS[project.defaultProvider]?.maxClipDuration}s</strong>
          </div>
        </div>

        {/* Card 4: Queue Health */}
        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Queue Health
          </div>
          <div className="flex items-center space-x-3 text-xs">
            <span className="flex items-center space-x-1 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{completedClips} Done</span>
            </span>
            <span className="flex items-center space-x-1 text-amber-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>{pendingClips} In-Flight</span>
            </span>
            {failedClips > 0 && (
              <span className="flex items-center space-x-1 text-rose-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>{failedClips} Fail</span>
              </span>
            )}
          </div>
          <div className="text-[11px] text-zinc-500">
            Preserves state across browser sessions.
          </div>
        </div>
      </div>

      {/* Scene-by-Scene Progress Breakdown */}
      <div className="space-y-3 bg-zinc-900/50 p-5 rounded-xl border border-zinc-800/80">
        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Scene Completion Status
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {project.scenes.map((scene) => {
            const sceneClips = project.clips.filter((c) => c.sceneId === scene.sceneId);
            const sceneDone = sceneClips.filter((c) => c.generationStatus === 'completed').length;
            const sceneTotal = sceneClips.length;
            const scenePct = sceneTotal > 0 ? Math.round((sceneDone / sceneTotal) * 100) : 0;
            const isFinished = sceneDone === sceneTotal;

            return (
              <div
                key={scene.sceneId}
                className="bg-zinc-950 p-3.5 rounded-lg border border-zinc-800 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white truncate max-w-[180px]">
                    Sc {scene.sceneNumber}: {scene.heading.replace('INT. ', '').replace('EXT. ', '')}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${isFinished ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'}`}>
                    {sceneDone}/{sceneTotal} Clips
                  </span>
                </div>

                <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${isFinished ? 'bg-emerald-400' : 'bg-cyan-400'}`}
                    style={{ width: `${scenePct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                  <span>Target: {formatDurationNice(scene.calculatedDuration)}</span>
                  <span>{scenePct}% Complete</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Asynchronous Jobs Feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          <span>Active & Recent Queue Jobs ({jobs.length})</span>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {jobs.length === 0 ? (
            <div className="p-4 bg-zinc-900/40 rounded-lg border border-zinc-800 text-center text-xs text-zinc-500">
              No jobs in flight. Click "Generate Remaining Clips" to begin asynchronous rendering.
            </div>
          ) : (
            jobs.map((job) => (
              <div
                key={job.jobId}
                className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center space-x-3">
                  <span
                    className={`p-1.5 rounded-md ${
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

                  <div>
                    <div className="font-semibold text-white">{job.title}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      Job ID: {job.jobId} • Retries: {job.retryCount}
                    </div>
                    {job.error && (
                      <div className="mt-1 text-[11px] text-rose-300 bg-rose-950/60 p-1.5 rounded border border-rose-800/60 max-w-xl">
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
