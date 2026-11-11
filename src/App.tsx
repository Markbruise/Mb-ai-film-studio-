/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  FilmProject,
  VideoClip,
  GenerationJob,
  ProviderId,
  PROVIDER_SPECS,
  RenderExportSettings,
} from './types/film';
import { generateFilmBreakdown, runContinuityAudit } from './utils/filmBreakdownEngine';
import { SAMPLE_SCREENPLAYS } from './data/sampleScreenplays';
import { formatSMPTETimecode, formatDurationNice } from './utils/timecode';
import { CinemaPlayer, CinemaPlayerRef } from './components/CinemaPlayer';
import { TimelineEditor } from './components/TimelineEditor';
import { ScreenplayStudio } from './components/ScreenplayStudio';
import { SceneBreakdownView } from './components/SceneBreakdownView';
import { ContinuityAssistantPanel } from './components/ContinuityAssistantPanel';
import { JobQueuePanel } from './components/JobQueuePanel';
import { ExportRenderCenter } from './components/ExportRenderCenter';

import {
  Film,
  Sparkles,
  Layers,
  ShieldCheck,
  Cpu,
  Download,
  Play,
  Clock,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Maximize2,
} from 'lucide-react';

export default function App() {
  // Initialize default project with Echoes of Kepler (5 minutes / 300 seconds)
  const [project, setProject] = useState<FilmProject>(() => {
    const saved = localStorage.getItem('mb_film_studio_project');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved project:', e);
      }
    }
    const sample = SAMPLE_SCREENPLAYS[0];
    return generateFilmBreakdown({
      title: sample.title,
      genre: sample.genre,
      logline: sample.logline,
      targetDurationSeconds: sample.defaultDurationSeconds, // 300s (5m)
      provider: 'gemini-omni',
      screenplay: sample.rawScript,
      characters: sample.characters,
      locations: sample.locations,
    });
  });

  // Job Queue state
  const [jobs, setJobs] = useState<GenerationJob[]>(() => {
    const saved = localStorage.getItem('mb_film_studio_jobs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved jobs:', e);
      }
    }
    return [];
  });

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<
    'timeline' | 'screenplay' | 'breakdown' | 'continuity' | 'queue' | 'export'
  >('timeline');

  // Player & Timeline scrubber state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isProcessingBreakdown, setIsProcessingBreakdown] = useState<boolean>(false);
  const [isAuditingContinuity, setIsAuditingContinuity] = useState<boolean>(false);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState<boolean>(false);

  const playerRef = useRef<CinemaPlayerRef | null>(null);

  // Sync to LocalStorage
  useEffect(() => {
    localStorage.setItem('mb_film_studio_project', JSON.stringify(project));
  }, [project]);

  useEffect(() => {
    localStorage.setItem('mb_film_studio_jobs', JSON.stringify(jobs));
  }, [jobs]);

  // Handle screenplay breakdown submission
  const handleApplyBreakdown = async (params: {
    screenplay: string;
    title: string;
    genre: string;
    logline: string;
    targetDurationSeconds: number;
    provider: ProviderId;
    characters?: { name: string; visualNotes: string; costume: string }[];
    locations?: { name: string; lighting: string; colorKey: string }[];
  }) => {
    setIsProcessingBreakdown(true);
    try {
      // Attempt server AI breakdown if available
      let aiResultData = null;
      try {
        const response = await fetch('/api/ai/breakdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            screenplay: params.screenplay,
            targetDurationSeconds: params.targetDurationSeconds,
            genre: params.genre,
            title: params.title,
            provider: params.provider,
          }),
        });
        if (response.ok) {
          const json = await response.json();
          if (json.source === 'gemini') {
            aiResultData = json.data;
          }
        }
      } catch (err) {
        console.warn('Server breakdown unavailable, falling back to client cinema engine:', err);
      }

      // Generate calibrated film project
      const newProject = generateFilmBreakdown({
        title: params.title,
        genre: params.genre,
        logline: params.logline,
        targetDurationSeconds: params.targetDurationSeconds,
        provider: params.provider,
        screenplay: params.screenplay,
        characters: params.characters,
        locations: params.locations,
        aiBreakdown: aiResultData,
      });

      setProject(newProject);
      setCurrentTime(0);
      setSelectedClipId(newProject.clips[0]?.clipId || null);

      // Create initial batch jobs for generation tracking
      const newJobs: GenerationJob[] = newProject.clips.map((clip, idx) => ({
        jobId: `job_${clip.clipId}`,
        filmProjectId: newProject.id,
        type: 'generate_clip',
        targetId: clip.clipId,
        title: `Generate Clip #${idx + 1} (${clip.duration.toFixed(1)}s - ${clip.provider})`,
        status: 'queued',
        progress: 0,
        createdAt: Date.now(),
        retryCount: 0,
      }));
      setJobs(newJobs);

      setActiveTab('timeline');
    } finally {
      setIsProcessingBreakdown(false);
    }
  };

  // Auto-Balance Timeline to match target duration precisely
  const handleAutoBalanceTimeline = () => {
    const target = project.targetDurationSeconds;
    const currentAssembled = project.actualAssembledDuration;
    const delta = target - currentAssembled;

    if (Math.abs(delta) < 0.1 || project.clips.length === 0) return;

    const providerSpec = PROVIDER_SPECS[project.defaultProvider];
    const newClips = [...project.clips];

    // Distribute delta across clips without exceeding provider maxClipDuration or falling below minClipDuration
    const perClipAdjustment = delta / newClips.length;

    let accumulatedStart = 0;
    newClips.forEach((clip) => {
      const candidateDur = clip.duration + perClipAdjustment;
      const boundedDur = Math.max(
        providerSpec.minClipDuration,
        Math.min(providerSpec.maxClipDuration, Math.round(candidateDur * 10) / 10)
      );
      clip.duration = boundedDur;
      clip.timelineStart = accumulatedStart;
      clip.timecode = formatSMPTETimecode(accumulatedStart);
      clip.outPoint = boundedDur;
      accumulatedStart += boundedDur;
    });

    // Final precision calibration on the last clip
    const newTotal = Math.round(accumulatedStart * 10) / 10;
    const finalDelta = Math.round((target - newTotal) * 10) / 10;
    if (Math.abs(finalDelta) > 0 && newClips.length > 0) {
      const last = newClips[newClips.length - 1];
      const tuned = Math.max(
        providerSpec.minClipDuration,
        Math.min(providerSpec.maxClipDuration, Math.round((last.duration + finalDelta) * 10) / 10)
      );
      last.duration = tuned;
      last.outPoint = tuned;
    }

    // Re-verify exact sum
    let finalSum = 0;
    newClips.forEach((c) => {
      c.timelineStart = finalSum;
      c.timecode = formatSMPTETimecode(finalSum);
      finalSum += c.duration;
    });

    const calibratedAssembled = Math.round(finalSum * 10) / 10;

    setProject((prev) => ({
      ...prev,
      clips: newClips,
      actualAssembledDuration: calibratedAssembled,
      updatedAt: new Date().toISOString(),
    }));
  };

  // Clip update handler
  const handleUpdateClip = (updatedClip: VideoClip) => {
    setProject((prev) => {
      const newClips = prev.clips.map((c) => (c.clipId === updatedClip.clipId ? updatedClip : c));
      // Recalculate sequential timeline starts
      let currStart = 0;
      newClips.forEach((c) => {
        c.timelineStart = currStart;
        c.timecode = formatSMPTETimecode(currStart);
        currStart += c.duration;
      });
      return {
        ...prev,
        clips: newClips,
        actualAssembledDuration: Math.round(currStart * 10) / 10,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  // Remove clip handler (preserves remaining timeline structure)
  const handleRemoveClip = (clipId: string) => {
    setProject((prev) => {
      const newClips = prev.clips.filter((c) => c.clipId !== clipId);
      let currStart = 0;
      newClips.forEach((c) => {
        c.timelineStart = currStart;
        c.timecode = formatSMPTETimecode(currStart);
        currStart += c.duration;
      });
      return {
        ...prev,
        clips: newClips,
        actualAssembledDuration: Math.round(currStart * 10) / 10,
        updatedAt: new Date().toISOString(),
      };
    });
    if (selectedClipId === clipId) setSelectedClipId(null);
  };

  // Reorder clips handler
  const handleReorderClips = (reorderedClips: VideoClip[]) => {
    let currStart = 0;
    reorderedClips.forEach((c) => {
      c.timelineStart = currStart;
      c.timecode = formatSMPTETimecode(currStart);
      currStart += c.duration;
    });
    setProject((prev) => ({
      ...prev,
      clips: reorderedClips,
      actualAssembledDuration: Math.round(currStart * 10) / 10,
      continuityIssues: runContinuityAudit(reorderedClips, prev.shots),
      updatedAt: new Date().toISOString(),
    }));
  };

  // Asynchronous Video Generation Hook
  const handleGenerateClip = async (clipId: string) => {
    const targetClip = project.clips.find((c) => c.clipId === clipId);
    if (!targetClip) return;

    handleUpdateClip({ ...targetClip, generationStatus: 'generating', progress: 10 });

    try {
      const response = await fetch('/api/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId,
          filmProjectId: project.id,
          prompt: targetClip.prompt,
          duration: targetClip.duration,
          aspectRatio: project.aspectRatio,
          provider: targetClip.provider || project.defaultProvider,
          characterReferences: targetClip.characterReferences,
          visualContinuity: targetClip.visualContinuity,
          characters: project.characters,
          locations: project.locations,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to start video generation');

      const newJob: GenerationJob = {
        jobId: data.jobId,
        filmProjectId: project.id,
        type: 'generate_clip',
        targetId: clipId,
        title: `Generate Clip ${clipId} (${targetClip.duration.toFixed(1)}s - ${targetClip.provider || project.defaultProvider})`,
        provider: targetClip.provider || project.defaultProvider,
        status: 'processing',
        progress: 15,
        createdAt: Date.now(),
        retryCount: 0,
      };

      setJobs((prev) => [newJob, ...prev.filter((j) => j.targetId !== clipId)]);

      // Poll status every 2 seconds
      const poller = setInterval(async () => {
        try {
          const res = await fetch('/api/jobs');
          if (res.ok) {
            const allJobs: GenerationJob[] = await res.json();
            const current = allJobs.find((j) => j.jobId === data.jobId);
            if (current) {
              setJobs((prev) =>
                prev.map((j) => (j.jobId === data.jobId ? { ...j, ...current } : j))
              );

              if (current.status === 'completed') {
                clearInterval(poller);
                handleUpdateClip({
                  ...targetClip,
                  generationStatus: 'completed',
                  progress: 100,
                  videoUrl: (current as any).videoUrl || targetClip.videoUrl,
                });
              } else if (current.status === 'failed') {
                clearInterval(poller);
                handleUpdateClip({
                  ...targetClip,
                  generationStatus: 'failed',
                  error: current.error,
                });
              }
            }
          }
        } catch (e) {
          console.warn('Polling error:', e);
        }
      }, 2000);
    } catch (err: any) {
      handleUpdateClip({
        ...targetClip,
        generationStatus: 'failed',
        error: err.message,
      });
    }
  };

  // Queue remaining clips; do not simulate successful generation.
  const handleGenerateAllRemaining = () => {
    setIsGeneratingBatch(false);
    const pendingClips = project.clips.filter((c) => c.generationStatus !== 'completed');
    pendingClips.forEach((clip) => handleGenerateClip(clip.clipId));
  };

  // Retry all failed clips
  const handleRetryFailed = () => {
    const failed = project.clips.filter((c) => c.generationStatus === 'failed');
    failed.forEach((c) => handleGenerateClip(c.clipId));
  };

  // Retry single job
  const handleRetrySingleJob = (jobId: string) => {
    const job = jobs.find((j) => j.jobId === jobId);
    if (!job) return;
    setJobs((prev) =>
      prev.map((j) => (j.jobId === jobId ? { ...j, status: 'queued', progress: 0, retryCount: j.retryCount + 1, error: 'Retry queued; no provider adapter is connected yet.' } : j))
    );
    if (job.targetId) {
      handleGenerateClip(job.targetId);
    }
  };

  // Apply continuity fix
  const handleApplyFix = (issueId: string) => {
    setProject((prev) => {
      const updatedIssues = prev.continuityIssues.map((issue) => {
        if (issue.id === issueId) {
          // Adjust clip prompt with continuity anchor tag
          const clipB = prev.clips.find((c) => c.clipId === issue.clipBId);
          if (clipB) {
            clipB.prompt = `[Continuity Match Vector: Screen direction anchored to Shot ${issue.shotNumberA}]. ${clipB.prompt}`;
            if (issue.issueType === 'screen_direction') {
              clipB.visualContinuity.screenDirection = 'left-to-right';
            }
          }
          return { ...issue, applied: true };
        }
        return issue;
      });
      return {
        ...prev,
        continuityIssues: updatedIssues,
      };
    });
  };

  // Re-audit continuity (queries Gemini AI audit if available, with local fallback)
  const handleReauditContinuity = async () => {
    setIsAuditingContinuity(true);
    try {
      let aiAuditIssues = null;
      try {
        const response = await fetch('/api/ai/continuity-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shots: project.shots }),
        });
        if (response.ok) {
          const json = await response.json();
          if (json.source === 'gemini' && json.data && Array.isArray(json.data.issues)) {
            aiAuditIssues = json.data.issues.map((iss: any, idx: number) => {
              const clipA =
                project.clips.find((c) => {
                  const s = project.shots.find((sh) => sh.shotId === c.shotId);
                  return s?.shotNumber === iss.shotNumberA;
                }) || project.clips[0];
              const clipB =
                project.clips.find((c) => {
                  const s = project.shots.find((sh) => sh.shotId === c.shotId);
                  return s?.shotNumber === iss.shotNumberB;
                }) || project.clips[1] || clipA;

              return {
                id: `ai_cont_${Date.now()}_${idx}`,
                clipAId: clipA?.clipId || 'clip_1',
                clipBId: clipB?.clipId || 'clip_2',
                sceneId: clipA?.sceneId || 'scene_1',
                shotNumberA: iss.shotNumberA || 1,
                shotNumberB: iss.shotNumberB || 2,
                issueType: (iss.issueType || 'camera_jump') as any,
                severity: (iss.severity || 'medium') as any,
                description: iss.description,
                recommendation: iss.recommendation,
                applied: false,
              };
            });
          }
        }
      } catch (err) {
        console.warn('AI continuity audit server request failed, utilizing local engine:', err);
      }

      const freshIssues = aiAuditIssues && aiAuditIssues.length > 0
        ? aiAuditIssues
        : runContinuityAudit(project.clips, project.shots);

      setProject((prev) => ({
        ...prev,
        continuityIssues: freshIssues,
      }));
    } finally {
      setIsAuditingContinuity(false);
    }
  };

  // Shot duration update from breakdown view
  const handleUpdateShotDuration = (shotId: string, newDuration: number) => {
    setProject((prev) => {
      const newShots = prev.shots.map((s) => (s.shotId === shotId ? { ...s, targetDuration: newDuration } : s));
      const targetShot = newShots.find((s) => s.shotId === shotId);
      if (!targetShot) return prev;

      // Update associated clips
      const associatedClips = prev.clips.filter((c) => c.shotId === shotId);
      if (associatedClips.length === 1) {
        associatedClips[0].duration = newDuration;
        associatedClips[0].outPoint = newDuration;
      }

      // Recalculate timeline starts
      let currStart = 0;
      prev.clips.forEach((c) => {
        c.timelineStart = currStart;
        c.timecode = formatSMPTETimecode(currStart);
        currStart += c.duration;
      });

      return {
        ...prev,
        shots: newShots,
        actualAssembledDuration: Math.round(currStart * 10) / 10,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  // Reset to default sample script
  const handleResetProject = () => {
    const sample = SAMPLE_SCREENPLAYS[0];
    const initial = generateFilmBreakdown({
      title: sample.title,
      genre: sample.genre,
      logline: sample.logline,
      targetDurationSeconds: sample.defaultDurationSeconds,
      provider: 'gemini-omni',
      screenplay: sample.rawScript,
      characters: sample.characters,
      locations: sample.locations,
    });
    setProject(initial);
    setCurrentTime(0);
    setSelectedClipId(initial.clips[0]?.clipId || null);
  };

  const providerSpec = PROVIDER_SPECS[project.defaultProvider];
  const delta = Math.round((project.actualAssembledDuration - project.targetDurationSeconds) * 10) / 10;
  const isTargetMatched = Math.abs(delta) <= 0.5;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans antialiased selection:bg-cyan-500 selection:text-black">
      {/* Top Application Header */}
      <header className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/80 px-4 py-2.5 flex items-center justify-between">
        {/* Brand & Project Info */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-950/50">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-sm tracking-tight text-white">M-b AI Film Studio</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                PRO NLE
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 flex items-center space-x-1.5">
              <span className="font-medium text-zinc-200 truncate max-w-[200px] sm:max-w-xs">{project.title}</span>
              <span>•</span>
              <span className="text-zinc-500">{project.genre}</span>
            </div>
          </div>
        </div>

        {/* Studio Navigation Tabs */}
        <nav className="hidden lg:flex items-center space-x-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800 text-xs">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'timeline'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <Film className="w-3.5 h-3.5 text-cyan-400" />
            <span>Timeline Editor</span>
          </button>

          <button
            onClick={() => setActiveTab('screenplay')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'screenplay'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Duration & Script</span>
          </button>

          <button
            onClick={() => setActiveTab('breakdown')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'breakdown'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Scene Breakdown</span>
          </button>

          <button
            onClick={() => setActiveTab('continuity')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'continuity'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Continuity</span>
          </button>

          <button
            onClick={() => setActiveTab('queue')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'queue'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span>Job Queue</span>
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'export'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <Download className="w-3.5 h-3.5 text-rose-400" />
            <span>Export Master</span>
          </button>
        </nav>

        {/* Right Header Controls */}
        <div className="flex items-center space-x-3">
          {/* Target Duration Readout */}
          <div className="hidden sm:flex items-center space-x-2 bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-lg text-xs font-mono">
            <span className="text-zinc-400 font-sans text-[11px]">Target:</span>
            <span className="font-bold text-cyan-300">{formatDurationNice(project.targetDurationSeconds)}</span>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-400 font-sans text-[11px]">Timeline:</span>
            <span className={`font-bold ${isTargetMatched ? 'text-emerald-400' : 'text-amber-400'}`}>
              {formatDurationNice(project.actualAssembledDuration)}
            </span>
          </div>

          {/* Quick Auto-Balance Button */}
          {!isTargetMatched && (
            <button
              onClick={handleAutoBalanceTimeline}
              title="Calibrate clips to match target duration precisely"
              className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition"
            >
              <Zap className="w-3 h-3 fill-current" />
              <span>Auto-Balance</span>
            </button>
          )}

          <button
            onClick={handleResetProject}
            title="Reset to Kepler-186 Demo Script"
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex items-center overflow-x-auto bg-zinc-900 border-b border-zinc-800 px-2 py-1 text-xs gap-1">
        {[
          { id: 'timeline', label: 'Timeline' },
          { id: 'screenplay', label: 'Script' },
          { id: 'breakdown', label: 'Breakdown' },
          { id: 'continuity', label: 'Continuity' },
          { id: 'queue', label: 'Queue' },
          { id: 'export', label: 'Export' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-3 py-1 rounded-md shrink-0 font-medium ${
              activeTab === t.id ? 'bg-zinc-800 text-white' : 'text-zinc-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Studio Viewport */}
      <main className="flex-1 p-4 lg:p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* View 1: Timeline Editor View (Includes Cinema Player + Multi-Track Timeline) */}
        {activeTab === 'timeline' && (
          <div className="space-y-6">
            {/* Cinema Player Viewport */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8">
                <CinemaPlayer
                  ref={playerRef}
                  project={project}
                  currentTime={currentTime}
                  onTimeUpdate={setCurrentTime}
                  selectedClipId={selectedClipId || undefined}
                  onSelectClip={(id) => setSelectedClipId(id)}
                />
              </div>

              {/* Side Shot & Scene Quick Card */}
              <div className="lg:col-span-4 bg-zinc-950 rounded-xl border border-zinc-800 p-4 space-y-4 flex flex-col justify-between shadow-xl">
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Active Playhead Shot
                    </span>
                    <span className="text-xs font-mono font-bold text-cyan-400">
                      {formatSMPTETimecode(currentTime, project.fps)}
                    </span>
                  </div>

                  {(() => {
                    const activeClip = project.clips.find(
                      (c) => currentTime >= c.timelineStart && currentTime < c.timelineStart + c.duration
                    ) || project.clips[project.clips.length - 1];

                    const activeShot = activeClip
                      ? project.shots.find((s) => s.shotId === activeClip.shotId)
                      : null;
                    const activeScene = activeClip
                      ? project.scenes.find((sc) => sc.sceneId === activeClip.sceneId)
                      : null;

                    if (!activeClip || !activeShot) {
                      return <div className="text-xs text-zinc-500">No clip active at playhead</div>;
                    }

                    return (
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs text-zinc-400">
                            Scene {activeScene?.sceneNumber || 1}: {activeScene?.location}
                          </div>
                          <h3 className="text-sm font-bold text-white mt-0.5">
                            Shot #{activeShot.shotNumber}: {activeShot.shotType}
                          </h3>
                        </div>

                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-emerald-400 font-mono">
                            {activeShot.cameraMovement}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-purple-400 font-mono">
                            {activeShot.angle}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-amber-400 font-mono">
                            {activeClip.duration.toFixed(1)}s
                          </span>
                        </div>

                        <p className="text-xs text-zinc-300 leading-relaxed font-sans line-clamp-4">
                          {activeShot.description}
                        </p>

                        {activeClip.totalClipsInShot > 1 && (
                          <div className="p-2 rounded bg-purple-950/40 border border-purple-500/30 text-[11px] text-purple-300 font-mono">
                            Provider segment {activeClip.clipIndexInShot}/{activeClip.totalClipsInShot} (Split for {activeClip.provider} {providerSpec.maxClipDuration}s limit)
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Quick Director Controls */}
                <div className="pt-3 border-t border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Provider</span>
                    <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${providerSpec.badgeColor}`}>
                      {providerSpec.name} (Max {providerSpec.maxClipDuration}s)
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveTab('screenplay')}
                    className="w-full py-2 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-xs text-zinc-200 border border-zinc-800 font-medium transition"
                  >
                    Adjust Film Duration & Screenplay
                  </button>
                </div>
              </div>
            </div>

            {/* Multi-Track Interactive Timeline Editor */}
            <TimelineEditor
              project={project}
              currentTime={currentTime}
              onSeek={(sec) => {
                setCurrentTime(sec);
                playerRef.current?.seekTo(sec);
              }}
              selectedClipId={selectedClipId}
              onSelectClip={setSelectedClipId}
              onUpdateClip={handleUpdateClip}
              onRemoveClip={handleRemoveClip}
              onReorderClips={handleReorderClips}
              onAutoBalanceTimeline={handleAutoBalanceTimeline}
              onGenerateClip={handleGenerateClip}
            />
          </div>
        )}

        {/* View 2: Screenplay Studio */}
        {activeTab === 'screenplay' && (
          <ScreenplayStudio
            currentDurationSeconds={project.targetDurationSeconds}
            currentProvider={project.defaultProvider}
            onApplyBreakdown={handleApplyBreakdown}
            isProcessing={isProcessingBreakdown}
          />
        )}

        {/* View 3: Scene & Shot Breakdown View */}
        {activeTab === 'breakdown' && (
          <SceneBreakdownView
            project={project}
            onSelectShot={(shotId) => {
              const clip = project.clips.find((c) => c.shotId === shotId);
              if (clip) {
                setSelectedClipId(clip.clipId);
                setCurrentTime(clip.timelineStart);
                setActiveTab('timeline');
              }
            }}
            onUpdateShotDuration={handleUpdateShotDuration}
            onAutoBalanceTimeline={handleAutoBalanceTimeline}
          />
        )}

        {/* View 4: Film Continuity Assistant */}
        {activeTab === 'continuity' && (
          <ContinuityAssistantPanel
            project={project}
            onApplyFix={handleApplyFix}
            onReauditContinuity={handleReauditContinuity}
            isAuditing={isAuditingContinuity}
          />
        )}

        {/* View 5: Job Queue & Asynchronous Monitor */}
        {activeTab === 'queue' && (
          <JobQueuePanel
            project={project}
            jobs={jobs}
            onGenerateAllRemaining={handleGenerateAllRemaining}
            onRetryFailed={handleRetryFailed}
            onRetrySingleJob={handleRetrySingleJob}
            onAssembleTimeline={handleAutoBalanceTimeline}
            onNavigateToPreview={() => setActiveTab('timeline')}
            onNavigateToExport={() => setActiveTab('export')}
            isGeneratingBatch={isGeneratingBatch}
          />
        )}

        {/* View 6: Video Rendering & Export Center */}
        {activeTab === 'export' && (
          <ExportRenderCenter
            project={project}
            onUpdateExportSettings={(settings) =>
              setProject((p) => ({ ...p, exportSettings: settings }))
            }
            onNavigateToPreview={() => setActiveTab('timeline')}
          />
        )}
      </main>

      {/* Footer Status Bar */}
      <footer className="bg-zinc-950 border-t border-zinc-900 px-4 py-2 text-[11px] text-zinc-500 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-3 font-mono">
          <span>M-b AI Film Studio v2.4</span>
          <span>•</span>
          <span>Target: {formatDurationNice(project.targetDurationSeconds)}</span>
          <span>•</span>
          <span>Clips: {project.clips.length}</span>
          <span>•</span>
          <span>Provider: {providerSpec.name} (Max {providerSpec.maxClipDuration}s)</span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Timeline Synchronized</span>
        </div>
      </footer>
    </div>
  );
}
