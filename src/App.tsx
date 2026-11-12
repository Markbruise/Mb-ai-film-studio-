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
  StudioLanguage,
  StudioUserSettings,
  VisualStylePreset,
  WorkflowStage,
  evaluateTimelineAccess,
} from './types/film';
import { generateFilmBreakdown, runContinuityAudit } from './utils/filmBreakdownEngine';
import { SAMPLE_SCREENPLAYS } from './data/sampleScreenplays';
import { formatSMPTETimecode, formatDurationNice } from './utils/timecode';
import { getLanguageOption, t } from './utils/i18n';

import { WelcomeDashboard } from './components/WelcomeDashboard';
import { CinemaPlayer, CinemaPlayerRef } from './components/CinemaPlayer';
import { TimelineEditor } from './components/TimelineEditor';
import { ScreenplayStudio } from './components/ScreenplayStudio';
import { SceneBreakdownView } from './components/SceneBreakdownView';
import { CharacterLocationStudio } from './components/CharacterLocationStudio';
import { StoryboardStudio } from './components/StoryboardStudio';
import { ContinuityAssistantPanel } from './components/ContinuityAssistantPanel';
import { JobQueuePanel } from './components/JobQueuePanel';
import { AudioProductionStudio } from './components/AudioProductionStudio';
import { ExportRenderCenter } from './components/ExportRenderCenter';
import { CreativeStudio } from './components/CreativeStudio';
import { ProjectsAndLibraryView } from './components/ProjectsAndLibraryView';
import { ProviderSettingsView } from './components/ProviderSettingsView';
import { HelpTutorialsView } from './components/HelpTutorialsView';

import {
  Film,
  Sparkles,
  Layers,
  ShieldCheck,
  Cpu,
  Download,
  Play,
  FileText,
  Zap,
  Home,
  Users,
  Image as ImageIcon,
  Volume2,
  Lock,
  Unlock,
  FolderOpen,
  HardDrive,
  Settings,
  HelpCircle,
} from 'lucide-react';

const DEFAULT_SETTINGS: StudioUserSettings = {
  uiLanguage: 'en',
  defaultScreenplayLanguage: 'en',
  defaultOutputLanguage: 'en',
  defaultProvider: 'gemini-omni',
  autoSaveIntervalSec: 5,
  preferredResolution: '1080p',
};

function createInitialDefaultProject(): FilmProject {
  const sample = SAMPLE_SCREENPLAYS[0];
  return generateFilmBreakdown({
    title: sample.title,
    genre: sample.genre,
    logline: sample.logline,
    targetDurationSeconds: sample.defaultDurationSeconds,
    provider: 'gemini-omni',
    screenplay: sample.rawScript,
    characters: sample.characters,
    locations: sample.locations,
  });
}

export default function App() {
  const [settings, setSettings] = useState<StudioUserSettings>(() => {
    try {
      const raw = localStorage.getItem('mb_film_studio_settings');
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const [project, setProject] = useState<FilmProject>(() => {
    try {
      const saved = localStorage.getItem('mb_film_studio_project');
      if (saved) return JSON.parse(saved);
    } catch {}
    return createInitialDefaultProject();
  });

  const [projectsList, setProjectsList] = useState<FilmProject[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>(() => {
    try {
      const saved = localStorage.getItem('mb_film_studio_jobs');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [activeStage, setActiveStage] = useState<WorkflowStage>('welcome');
  const [creativeSubTab, setCreativeSubTab] = useState<'music' | 'animate' | 'concept'>('music');

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(
    () => project.clips[0]?.clipId || null
  );
  const [isProcessingBreakdown, setIsProcessingBreakdown] = useState<boolean>(false);
  const [isCreatingProject, setIsCreatingProject] = useState<boolean>(false);
  const [isAuditingContinuity, setIsAuditingContinuity] = useState<boolean>(false);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState<boolean>(false);

  const playerRef = useRef<CinemaPlayerRef | null>(null);
  const pollTimersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const uiLanguage = settings.uiLanguage || 'en';
  const timelineAccess = evaluateTimelineAccess(project);

  // Sync RTL/LTR direction on document root
  useEffect(() => {
    document.documentElement.dir = getLanguageOption(uiLanguage).dir;
    localStorage.setItem('mb_film_studio_settings', JSON.stringify(settings));
  }, [settings, uiLanguage]);

  // Initial load from server /api/projects + /api/jobs
  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.projects;
        if (Array.isArray(list) && list.length > 0) {
          setProjectsList(list);
        } else {
          setProjectsList([project]);
          fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project),
          }).catch(() => {});
        }
      })
      .catch(() => setProjectsList([project]));

    fetch('/api/jobs')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setJobs(data);
        }
      })
      .catch(() => {});
  }, []);

  // LocalStorage + debounced server persistence for active project
  useEffect(() => {
    try {
      localStorage.setItem('mb_film_studio_project', JSON.stringify(project));
    } catch {}

    setProjectsList((prev) => {
      const idx = prev.findIndex((p) => p.id === project.id);
      if (idx === -1) return [project, ...prev];
      const next = [...prev];
      next[idx] = project;
      return next;
    });

    const saveTimer = setTimeout(() => {
      fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      }).catch(() => {});
    }, 900);

    return () => clearTimeout(saveTimer);
  }, [project]);

  useEffect(() => {
    try {
      localStorage.setItem('mb_film_studio_jobs', JSON.stringify(jobs));
    } catch {}
  }, [jobs]);

  // Cleanup active pollers on unmount
  useEffect(() => {
    return () => {
      Object.values(pollTimersRef.current).forEach((t) => clearInterval(t));
    };
  }, []);

  // Create New Film from Welcome Dashboard Wizard
  const handleCreateNewProject = async (params: {
    title: string;
    description: string;
    genre: string;
    screenplayLanguage: StudioLanguage;
    outputLanguage: StudioLanguage;
    targetDurationSeconds: number;
    aspectRatio: '16:9' | '9:16' | '1:1' | '2.39:1';
    resolution: '720p' | '1080p' | '4K Cinema';
    visualStyle: VisualStylePreset;
    targetAudience: string;
    provider: ProviderId;
    autoGenerateScript: boolean;
  }) => {
    setIsCreatingProject(true);
    try {
      let screenplayText = `SCENE 1 - EXT. OPENING LOCATION - DAY\n\n${params.description || `An atmospheric opening frame for ${params.title}.`}\n\nPROTAGONIST\nEvery great story starts with a single frame.\n\nSCENE 2 - INT. KEY ENCOUNTER - GOLDEN HOUR\n\nTension rises as the central conflict unfolds toward the climax.`;

      if (params.autoGenerateScript) {
        try {
          const genRes = await fetch('/api/ai/screenplay/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: params.title,
              idea: params.description || params.title,
              genre: params.genre,
              language: params.screenplayLanguage,
              targetDurationSeconds: params.targetDurationSeconds,
              visualStyle: params.visualStyle,
            }),
          });
          const genData = await genRes.json();
          if (genRes.ok && genData.screenplay) {
            screenplayText = genData.screenplay;
          }
        } catch (err) {
          console.warn('AI script generation fell back to structured starter template:', err);
        }
      }

      const newProj = generateFilmBreakdown({
        title: params.title,
        description: params.description,
        genre: params.genre,
        logline: params.description || `${params.genre} film by M-b AI Film Studio.`,
        targetDurationSeconds: params.targetDurationSeconds,
        provider: params.provider,
        screenplay: screenplayText,
        screenplayLanguage: params.screenplayLanguage,
        outputLanguage: params.outputLanguage,
        visualStyle: params.visualStyle,
        targetAudience: params.targetAudience,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
      });

      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProj),
      }).catch(() => {});

      setProject(newProj);
      setCurrentTime(0);
      setSelectedClipId(newProj.clips[0]?.clipId || null);
      setActiveStage('screenplay');
    } finally {
      setIsCreatingProject(false);
    }
  };

  // Handle screenplay breakdown submission
  const handleApplyBreakdown = async (params: {
    screenplay: string;
    title: string;
    genre: string;
    logline: string;
    targetDurationSeconds: number;
    provider: ProviderId;
    screenplayLanguage?: StudioLanguage;
    outputLanguage?: StudioLanguage;
    characters?: { name: string; visualNotes: string; costume: string }[];
    locations?: { name: string; lighting: string; colorKey: string }[];
  }) => {
    setIsProcessingBreakdown(true);
    try {
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
        console.warn('Server breakdown unavailable, using local scene engine:', err);
      }

      const newProject = generateFilmBreakdown({
        projectId: project.id,
        title: params.title,
        description: project.description,
        genre: params.genre,
        logline: params.logline,
        targetDurationSeconds: params.targetDurationSeconds,
        provider: params.provider,
        screenplay: params.screenplay,
        screenplayLanguage: params.screenplayLanguage || project.screenplayLanguage,
        outputLanguage: params.outputLanguage || project.outputLanguage,
        visualStyle: project.visualStyle,
        targetAudience: project.targetAudience,
        aspectRatio: project.aspectRatio,
        resolution: project.resolution,
        characters: params.characters,
        locations: params.locations,
        characterProfiles: project.characterProfiles,
        locationProfiles: project.locationProfiles,
        aiBreakdown: aiResultData,
      });

      setProject(newProject);
      setCurrentTime(0);
      setSelectedClipId(newProject.clips[0]?.clipId || null);

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

      setActiveStage('breakdown');
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

    const providerSpec = PROVIDER_SPECS[project.defaultProvider] || PROVIDER_SPECS['gemini-omni'];
    const newClips = project.clips.map((c) => ({ ...c }));
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
      clip.timecode = formatSMPTETimecode(accumulatedStart, project.fps);
      clip.outPoint = boundedDur;
      accumulatedStart += boundedDur;
    });

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

    let finalSum = 0;
    newClips.forEach((c) => {
      c.timelineStart = finalSum;
      c.timecode = formatSMPTETimecode(finalSum, project.fps);
      finalSum += c.duration;
    });

    setProject((prev) => ({
      ...prev,
      clips: newClips,
      actualAssembledDuration: Math.round(finalSum * 10) / 10,
      updatedAt: new Date().toISOString(),
    }));
  };

  // Clip update handler (functional update safe against stale closures)
  const handleUpdateClip = (updatedClip: VideoClip) => {
    setProject((prev) => {
      const newClips = prev.clips.map((c) => (c.clipId === updatedClip.clipId ? updatedClip : c));
      let currStart = 0;
      const normalized = newClips.map((c) => {
        const next = {
          ...c,
          timelineStart: currStart,
          timecode: formatSMPTETimecode(currStart, prev.fps),
        };
        currStart += next.duration;
        return next;
      });
      return {
        ...prev,
        clips: normalized,
        actualAssembledDuration: Math.round(currStart * 10) / 10,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleUpdateClipConfig = (clipId: string, patch: Partial<VideoClip>) => {
    setProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.clipId === clipId ? { ...c, ...patch } : c)),
      updatedAt: new Date().toISOString(),
    }));
  };

  // Split clip into two sequential clips
  const handleSplitClip = (clipId: string) => {
    setProject((prev) => {
      const idx = prev.clips.findIndex((c) => c.clipId === clipId);
      if (idx === -1) return prev;
      const orig = prev.clips[idx];
      const halfA = Math.round((orig.duration / 2) * 10) / 10;
      const halfB = Math.round((orig.duration - halfA) * 10) / 10;

      const clipA: VideoClip = {
        ...orig,
        duration: halfA,
        outPoint: halfA,
        clipIndexInShot: orig.clipIndexInShot,
        totalClipsInShot: orig.totalClipsInShot + 1,
      };
      const clipB: VideoClip = {
        ...orig,
        clipId: `${orig.clipId}_part_${Date.now().toString().slice(-4)}`,
        duration: halfB,
        inPoint: 0,
        outPoint: halfB,
        clipIndexInShot: orig.clipIndexInShot + 1,
        totalClipsInShot: orig.totalClipsInShot + 1,
        transitionIn: 'cut',
      };

      const spliced = [...prev.clips];
      spliced.splice(idx, 1, clipA, clipB);

      let currStart = 0;
      const recalculated = spliced.map((c) => {
        const next = {
          ...c,
          timelineStart: currStart,
          timecode: formatSMPTETimecode(currStart, prev.fps),
        };
        currStart += next.duration;
        return next;
      });

      return {
        ...prev,
        clips: recalculated,
        actualAssembledDuration: Math.round(currStart * 10) / 10,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleRemoveClip = (clipId: string) => {
    setProject((prev) => {
      const newClips = prev.clips.filter((c) => c.clipId !== clipId);
      let currStart = 0;
      const normalized = newClips.map((c) => {
        const next = {
          ...c,
          timelineStart: currStart,
          timecode: formatSMPTETimecode(currStart, prev.fps),
        };
        currStart += next.duration;
        return next;
      });
      return {
        ...prev,
        clips: normalized,
        actualAssembledDuration: Math.round(currStart * 10) / 10,
        updatedAt: new Date().toISOString(),
      };
    });
    if (selectedClipId === clipId) setSelectedClipId(null);
  };

  const handleReorderClips = (reorderedClips: VideoClip[]) => {
    let currStart = 0;
    const normalized = reorderedClips.map((c) => {
      const next = {
        ...c,
        timelineStart: currStart,
        timecode: formatSMPTETimecode(currStart, project.fps),
      };
      currStart += next.duration;
      return next;
    });
    setProject((prev) => ({
      ...prev,
      clips: normalized,
      actualAssembledDuration: Math.round(currStart * 10) / 10,
      continuityIssues: runContinuityAudit(normalized, prev.shots),
      updatedAt: new Date().toISOString(),
    }));
  };

  // Upload custom real MP4 footage for a clip
  const handleUploadClipVideo = async (clipId: string, file: File) => {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read uploaded video file'));
      reader.readAsDataURL(file);
    });

    const res = await fetch('/api/upload/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clipId,
        base64Data,
        filename: file.name,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      handleUpdateClipConfig(clipId, {
        generationStatus: 'failed',
        error: data.error || 'Video upload failed',
      });
      return;
    }

    handleUpdateClipConfig(clipId, {
      videoUrl: data.videoUrl,
      duration: data.duration || undefined,
      outPoint: data.duration || undefined,
      generationStatus: 'completed',
      progress: 100,
      error: undefined,
    });
  };

  // Asynchronous Video Generation Worker Dispatch
  const handleGenerateClip = async (clipId: string, overrides?: Partial<VideoClip>) => {
    const baseClip = project.clips.find((c) => c.clipId === clipId);
    if (!baseClip) return;
    const targetClip = { ...baseClip, ...overrides };

    handleUpdateClipConfig(clipId, {
      ...overrides,
      generationStatus: 'generating',
      progress: 10,
      error: undefined,
    });

    // Gather character reference images matching this shot
    const characterRefImages: string[] = [];
    (project.characterProfiles || []).forEach((ch) => {
      if (
        ch.referenceImageUrl &&
        (targetClip.characterReferences?.includes(ch.name) ||
          targetClip.prompt.toLowerCase().includes(ch.name.toLowerCase()))
      ) {
        characterRefImages.push(ch.referenceImageUrl);
      }
    });

    const storyboardFrame = (project.storyboardFrames || []).find(
      (f) => f.shotId === targetClip.shotId
    );
    const firstFrameImage = targetClip.firstFrameImage || storyboardFrame?.imageUrl;

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
          resolution: targetClip.resolution || project.resolution,
          provider: targetClip.provider || project.defaultProvider,
          characterReferences: targetClip.characterReferences,
          characterRefImages,
          firstFrameImage,
          lastFrameImage: targetClip.lastFrameImage,
          visualContinuity: targetClip.visualContinuity,
          characters: project.characterProfiles || project.characters,
          locations: project.locationProfiles || project.locations,
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

      if (pollTimersRef.current[clipId]) {
        clearInterval(pollTimersRef.current[clipId]);
      }

      pollTimersRef.current[clipId] = setInterval(async () => {
        try {
          const res = await fetch('/api/jobs');
          if (!res.ok) return;
          const allJobs: GenerationJob[] = await res.json();
          const current = allJobs.find((j) => j.jobId === data.jobId);
          if (!current) return;

          setJobs((prev) =>
            prev.map((j) => (j.jobId === data.jobId ? { ...j, ...current } : j))
          );

          if (current.status === 'completed') {
            clearInterval(pollTimersRef.current[clipId]);
            delete pollTimersRef.current[clipId];
            handleUpdateClipConfig(clipId, {
              generationStatus: 'completed',
              progress: 100,
              videoUrl: current.videoUrl || targetClip.videoUrl,
              error: undefined,
            });
          } else if (current.status === 'failed' || current.status === 'cancelled') {
            clearInterval(pollTimersRef.current[clipId]);
            delete pollTimersRef.current[clipId];
            handleUpdateClipConfig(clipId, {
              generationStatus: 'failed',
              progress: 0,
              error: current.error || 'Video generation failed',
            });
          }
        } catch (e) {
          console.warn('Polling error:', e);
        }
      }, 2000);
    } catch (err: any) {
      handleUpdateClipConfig(clipId, {
        generationStatus: 'failed',
        progress: 0,
        error: err.message || 'Video generation error',
      });
    }
  };

  const handleGenerateAllRemaining = async () => {
    setIsGeneratingBatch(true);
    try {
      const pendingClips = project.clips.filter((c) => c.generationStatus !== 'completed');
      for (const clip of pendingClips) {
        await handleGenerateClip(clip.clipId);
      }
    } finally {
      setIsGeneratingBatch(false);
    }
  };

  const handleRetryFailed = () => {
    const failed = project.clips.filter((c) => c.generationStatus === 'failed');
    failed.forEach((c) => handleGenerateClip(c.clipId));
  };

  const handleRetrySingleJob = (jobId: string) => {
    const job = jobs.find((j) => j.jobId === jobId);
    if (!job) return;
    setJobs((prev) =>
      prev.map((j) =>
        j.jobId === jobId
          ? { ...j, status: 'queued', progress: 0, retryCount: j.retryCount + 1, error: undefined }
          : j
      )
    );
    if (job.targetId) {
      handleGenerateClip(job.targetId);
    }
  };

  const handleApplyFix = (issueId: string) => {
    setProject((prev) => {
      const updatedClips = prev.clips.map((c) => ({ ...c }));
      const updatedIssues = prev.continuityIssues.map((issue) => {
        if (issue.id === issueId) {
          const clipB = updatedClips.find((c) => c.clipId === issue.clipBId);
          if (clipB) {
            clipB.prompt = `[Continuity Match: Anchored to Shot ${issue.shotNumberA}] ${clipB.prompt}`;
            if (issue.issueType === 'screen_direction') {
              clipB.visualContinuity = {
                ...clipB.visualContinuity,
                screenDirection: 'left-to-right',
              };
            }
          }
          return { ...issue, applied: true };
        }
        return issue;
      });
      return {
        ...prev,
        clips: updatedClips,
        continuityIssues: updatedIssues,
        updatedAt: new Date().toISOString(),
      };
    });
  };

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
                }) ||
                project.clips[1] ||
                clipA;

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
        console.warn('AI continuity audit fell back locally:', err);
      }

      const freshIssues =
        aiAuditIssues && aiAuditIssues.length > 0
          ? aiAuditIssues
          : runContinuityAudit(project.clips, project.shots);

      setProject((prev) => ({
        ...prev,
        continuityIssues: freshIssues,
        updatedAt: new Date().toISOString(),
      }));
    } finally {
      setIsAuditingContinuity(false);
    }
  };

  const handleUpdateShotDuration = (shotId: string, newDuration: number) => {
    setProject((prev) => {
      const newShots = prev.shots.map((s) =>
        s.shotId === shotId ? { ...s, targetDuration: newDuration } : s
      );
      const updatedClips = prev.clips.map((c) => ({ ...c }));
      const associated = updatedClips.filter((c) => c.shotId === shotId);
      if (associated.length === 1) {
        associated[0].duration = newDuration;
        associated[0].outPoint = newDuration;
      }

      let currStart = 0;
      updatedClips.forEach((c) => {
        c.timelineStart = currStart;
        c.timecode = formatSMPTETimecode(currStart, prev.fps);
        currStart += c.duration;
      });

      return {
        ...prev,
        shots: newShots,
        clips: updatedClips,
        actualAssembledDuration: Math.round(currStart * 10) / 10,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  // Multi-project repository handlers
  const handleSelectProject = (proj: FilmProject) => {
    setProject(proj);
    setCurrentTime(0);
    setSelectedClipId(proj.clips[0]?.clipId || null);
    setActiveStage('screenplay');
  };

  const handleDuplicateProject = async (projectId: string) => {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/duplicate`, {
      method: 'POST',
    });
    if (res.ok) {
      const data = await res.json();
      const copied = data?.project || data;
      if (copied?.id) {
        setProjectsList((prev) => [copied, ...prev]);
      }
    }
  };

  const handleArchiveProject = async (projectId: string, archived: boolean) => {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    if (res.ok) {
      const data = await res.json();
      const updated = data?.project || data;
      if (updated?.id) {
        setProjectsList((prev) =>
          prev.map((p) => (p.id === projectId ? updated : p))
        );
        if (project.id === projectId) {
          setProject(updated);
        }
      }
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const remaining = projectsList.filter((p) => p.id !== projectId);
      setProjectsList(remaining);
      if (project.id === projectId) {
        if (remaining.length > 0) {
          setProject(remaining[0]);
        } else {
          setProject(createInitialDefaultProject());
        }
      }
    }
  };

  const providerSpec = PROVIDER_SPECS[project.defaultProvider] || PROVIDER_SPECS['gemini-omni'];
  const delta = Math.round((project.actualAssembledDuration - project.targetDurationSeconds) * 10) / 10;
  const isTargetMatched = Math.abs(delta) <= 0.5;

  const navItems: Array<{
    id: WorkflowStage;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    locked?: boolean;
  }> = [
    { id: 'welcome', label: t(uiLanguage, 'navWelcome'), icon: Home, accent: 'text-cyan-400' },
    { id: 'screenplay', label: t(uiLanguage, 'navScript'), icon: FileText, accent: 'text-amber-400' },
    { id: 'breakdown', label: t(uiLanguage, 'navBreakdown'), icon: Layers, accent: 'text-indigo-400' },
    { id: 'characters', label: t(uiLanguage, 'navCharacters'), icon: Users, accent: 'text-emerald-400' },
    { id: 'storyboard', label: t(uiLanguage, 'navStoryboard'), icon: ImageIcon, accent: 'text-purple-400' },
    { id: 'production', label: t(uiLanguage, 'navVideoGen'), icon: Cpu, accent: 'text-cyan-400' },
    {
      id: 'timeline',
      label: t(uiLanguage, 'navTimeline'),
      icon: timelineAccess.unlocked ? Unlock : Lock,
      accent: timelineAccess.unlocked ? 'text-emerald-400' : 'text-amber-400',
      locked: !timelineAccess.unlocked,
    },
    { id: 'audio', label: t(uiLanguage, 'navAudio'), icon: Volume2, accent: 'text-purple-400' },
    { id: 'preview', label: t(uiLanguage, 'navPreview'), icon: Play, accent: 'text-cyan-400' },
    { id: 'export', label: t(uiLanguage, 'navExport'), icon: Download, accent: 'text-rose-400' },
  ];

  return (
    <div className="min-h-screen bg-[#07090d] text-zinc-100 flex flex-col font-sans antialiased selection:bg-cyan-500 selection:text-black">
      {/* Top Studio Header */}
      <header className="sticky top-0 z-50 bg-[#07090d]/95 backdrop-blur-xl border-b border-zinc-800/80 px-3 sm:px-5 py-2.5 flex items-center justify-between gap-3">
        {/* Brand & Active Film */}
        <button
          type="button"
          onClick={() => setActiveStage('welcome')}
          className="flex items-center space-x-3 text-left shrink-0 group"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-950/50 group-hover:scale-105 transition">
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-sm tracking-tight text-white">
                {t(uiLanguage, 'brandName')}
              </span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                STUDIO
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 flex items-center space-x-1.5">
              <span className="font-medium text-zinc-200 truncate max-w-[140px] sm:max-w-[200px]">
                {project.title}
              </span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline text-zinc-500 font-mono">
                {formatDurationNice(project.targetDurationSeconds)}
              </span>
            </div>
          </div>
        </button>

        {/* Primary Desktop Workflow Stepper */}
        <nav className="hidden xl:flex items-center space-x-0.5 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 text-[11px]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeStage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveStage(item.id)}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg font-medium transition ${
                  isActive
                    ? 'bg-zinc-800 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${item.accent}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Utility Actions */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveStage('creative')}
            className={`hidden md:flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
              activeStage === 'creative'
                ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-amber-300'
            }`}
            title="Creative Lab (Lyria 3, Image-to-Video, Concept Art)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline">Creative Lab</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStage('continuity')}
            className={`p-2 rounded-lg border transition ${
              activeStage === 'continuity'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
            title="Continuity Audit"
          >
            <ShieldCheck className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setActiveStage('projects')}
            className={`p-2 rounded-lg border transition ${
              activeStage === 'projects'
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
            title={t(uiLanguage, 'myProjects')}
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setActiveStage('assets')}
            className={`p-2 rounded-lg border transition ${
              activeStage === 'assets'
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
            title={t(uiLanguage, 'mediaAssetLibrary')}
          >
            <HardDrive className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setActiveStage('settings')}
            className={`p-2 rounded-lg border transition ${
              activeStage === 'settings'
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
            title={t(uiLanguage, 'settings')}
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setActiveStage('help')}
            className={`p-2 rounded-lg border transition ${
              activeStage === 'help'
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-white'
            }`}
            title={t(uiLanguage, 'helpTutorials')}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile & Tablet Horizontal Scrollable Stage Strip (44px tap targets) */}
      <div className="xl:hidden flex items-center overflow-x-auto bg-zinc-950 border-b border-zinc-800 px-3 py-1.5 text-xs gap-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeStage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveStage(item.id)}
              className={`min-h-[38px] flex items-center space-x-1.5 px-3 py-1.5 rounded-lg shrink-0 font-medium border transition ${
                isActive
                  ? 'bg-zinc-800 border-zinc-700 text-white'
                  : 'bg-zinc-900/50 border-zinc-800/80 text-zinc-400 hover:text-white'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${item.accent}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Studio Workspace */}
      <main className="flex-1 p-3 sm:p-5 lg:p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Stage 0: Welcome Page & Dashboard */}
        {activeStage === 'welcome' && (
          <WelcomeDashboard
            activeProject={project}
            projects={projectsList}
            uiLanguage={uiLanguage}
            onSelectProject={handleSelectProject}
            onCreateNewProject={handleCreateNewProject}
            onNavigate={setActiveStage}
            isCreating={isCreatingProject}
          />
        )}

        {/* Stage 1: Script Studio */}
        {activeStage === 'screenplay' && (
          <ScreenplayStudio
            activeProject={project}
            currentDurationSeconds={project.targetDurationSeconds}
            currentProvider={project.defaultProvider}
            onApplyBreakdown={handleApplyBreakdown}
            isProcessing={isProcessingBreakdown}
          />
        )}

        {/* Stage 2: Scene & Shot Breakdown */}
        {activeStage === 'breakdown' && (
          <SceneBreakdownView
            project={project}
            onSelectShot={(shotId) => {
              const clip = project.clips.find((c) => c.shotId === shotId);
              if (clip) {
                setSelectedClipId(clip.clipId);
                setCurrentTime(clip.timelineStart);
              }
              setActiveStage('storyboard');
            }}
            onUpdateShotDuration={handleUpdateShotDuration}
            onAutoBalanceTimeline={handleAutoBalanceTimeline}
            onApproveBreakdown={() =>
              setProject((prev) => ({
                ...prev,
                breakdownApproved: true,
                updatedAt: new Date().toISOString(),
              }))
            }
            onProceedToCharacters={() => setActiveStage('characters')}
          />
        )}

        {/* Stage 3: Characters & Locations Studio */}
        {activeStage === 'characters' && (
          <CharacterLocationStudio
            project={project}
            onUpdateProject={setProject}
            onProceedToStoryboard={() => setActiveStage('storyboard')}
          />
        )}

        {/* Stage 4: Storyboard Approval Gate */}
        {activeStage === 'storyboard' && (
          <StoryboardStudio
            project={project}
            uiLanguage={uiLanguage}
            onUpdateProject={setProject}
            onProceedToVideoProduction={() => setActiveStage('production')}
          />
        )}

        {/* Stage 5: AI Video Production Center */}
        {activeStage === 'production' && (
          <JobQueuePanel
            project={project}
            jobs={jobs}
            timelineAccess={timelineAccess}
            onGenerateAllRemaining={handleGenerateAllRemaining}
            onGenerateSingleClip={handleGenerateClip}
            onUploadClipVideo={handleUploadClipVideo}
            onUpdateClipConfig={handleUpdateClipConfig}
            onRetryFailed={handleRetryFailed}
            onRetrySingleJob={handleRetrySingleJob}
            onAssembleTimeline={handleAutoBalanceTimeline}
            onNavigateToTimeline={() => setActiveStage('timeline')}
            onNavigateToStoryboard={() => setActiveStage('storyboard')}
            onNavigateToPreview={() => setActiveStage('preview')}
            onNavigateToExport={() => setActiveStage('export')}
            isGeneratingBatch={isGeneratingBatch}
          />
        )}

        {/* Stage 6: Timeline Editor (STRICTLY LOCKED until every clip is completed with verified footage) */}
        {activeStage === 'timeline' && (
          !timelineAccess.unlocked ? (
            <div className="bg-zinc-950 rounded-2xl border border-amber-500/40 p-6 sm:p-8 shadow-2xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
                <div className="flex items-start space-x-4">
                  <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-400 shrink-0">
                    <Lock className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-xs font-mono uppercase tracking-widest text-amber-400">
                      Strict Production Gate
                    </div>
                    <h2 className="text-2xl font-bold text-white mt-0.5">
                      {t(uiLanguage, 'timelineLockedTitle')}
                    </h2>
                    <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
                      {t(uiLanguage, 'timelineLockedBody')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveStage('production')}
                    className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg transition"
                  >
                    <Cpu className="w-4 h-4" />
                    <span>{t(uiLanguage, 'goToVideoCenter')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveStage('storyboard')}
                    className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200 transition"
                  >
                    Storyboard Studio
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-300">
                    Verification Progress: {timelineAccess.readyClips} / {timelineAccess.totalClips} clips verified
                  </span>
                  <span className="font-mono text-amber-300">
                    {timelineAccess.blockedClips.length} clip(s) blocking Timeline access
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-1">
                  {timelineAccess.blockedClips.map((b) => (
                    <div
                      key={b.clipId}
                      className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-white">
                          Scene {b.sceneNumber} • Shot {b.shotNumber}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate mt-0.5">{b.reason}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveStage('production')}
                        className="px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-cyan-300 font-semibold shrink-0"
                      >
                        Resolve
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
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
                      const activeClip =
                        project.clips.find(
                          (c) =>
                            currentTime >= c.timelineStart &&
                            currentTime < c.timelineStart + c.duration
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

                          <p className="text-xs text-zinc-300 leading-relaxed line-clamp-4">
                            {activeShot.description}
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="pt-3 border-t border-zinc-800 space-y-2">
                    <button
                      type="button"
                      onClick={() => setActiveStage('audio')}
                      className="w-full py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-200 border border-zinc-800 font-medium transition flex items-center justify-center space-x-1.5"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                      <span>Open Audio & Voice Studio</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveStage('export')}
                      className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-bold transition flex items-center justify-center space-x-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Proceed to Master MP4 Export</span>
                    </button>
                  </div>
                </div>
              </div>

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
                onUpdateProject={setProject}
                onSplitClip={handleSplitClip}
                onOpenAudioStudio={() => setActiveStage('audio')}
                onOpenCreativeStudio={(tab) => {
                  if (tab) setCreativeSubTab(tab);
                  setActiveStage('creative');
                }}
              />
            </div>
          )
        )}

        {/* Stage 7: Audio & Voice Production Studio */}
        {activeStage === 'audio' && (
          <AudioProductionStudio
            project={project}
            onUpdateProject={setProject}
            onOpenMusicComposer={() => {
              setCreativeSubTab('music');
              setActiveStage('creative');
            }}
          />
        )}

        {/* Continuity Inspector */}
        {activeStage === 'continuity' && (
          <ContinuityAssistantPanel
            project={project}
            onApplyFix={handleApplyFix}
            onReauditContinuity={handleReauditContinuity}
            isAuditing={isAuditingContinuity}
          />
        )}

        {/* Creative Lab (Lyria 3, Concept Art, Image-to-Video) */}
        {activeStage === 'creative' && (
          <CreativeStudio
            project={project}
            onUpdateProject={setProject}
            selectedClipId={selectedClipId}
            onNavigateToTimeline={() =>
              setActiveStage(timelineAccess.unlocked ? 'timeline' : 'production')
            }
            initialSubTab={creativeSubTab}
          />
        )}

        {/* Stage 8: Full Film Cinema Preview */}
        {activeStage === 'preview' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              <div>
                <h2 className="text-lg font-bold text-white">Cinema Screening Room — {project.title}</h2>
                <p className="text-xs text-zinc-400">
                  Full-screen playback preview with assembled shots, transitions, dialogue audio & subtitles ({timelineAccess.readyClips}/{timelineAccess.totalClips} verified clips).
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setActiveStage(timelineAccess.unlocked ? 'timeline' : 'production')}
                  className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200"
                >
                  {timelineAccess.unlocked ? 'Edit Timeline' : 'Open AI Video Center'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStage('export')}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white"
                >
                  Export Master MP4
                </button>
              </div>
            </div>

            <CinemaPlayer
              ref={playerRef}
              project={project}
              currentTime={currentTime}
              onTimeUpdate={setCurrentTime}
              selectedClipId={selectedClipId || undefined}
              onSelectClip={(id) => setSelectedClipId(id)}
            />
          </div>
        )}

        {/* Stage 9: Export & Delivery Center */}
        {activeStage === 'export' && (
          <ExportRenderCenter
            project={project}
            onUpdateExportSettings={(nextSettings: RenderExportSettings) =>
              setProject((p) => ({ ...p, exportSettings: nextSettings }))
            }
            onNavigateToPreview={() => setActiveStage('preview')}
            onNavigateToProduction={() => setActiveStage('production')}
          />
        )}

        {/* Repository Views: My Projects & Media Library */}
        {(activeStage === 'projects' || activeStage === 'assets') && (
          <ProjectsAndLibraryView
            initialTab={activeStage === 'assets' ? 'assets' : 'projects'}
            activeProjectId={project.id}
            projects={projectsList}
            onSelectProject={handleSelectProject}
            onDuplicateProject={handleDuplicateProject}
            onArchiveProject={handleArchiveProject}
            onDeleteProject={handleDeleteProject}
            onCreateNewFromWelcome={() => setActiveStage('welcome')}
          />
        )}

        {/* Settings & Provider Diagnostics */}
        {activeStage === 'settings' && (
          <ProviderSettingsView
            settings={settings}
            onUpdateSettings={setSettings}
          />
        )}

        {/* Help & Documentation */}
        {activeStage === 'help' && (
          <HelpTutorialsView onStartWorkflow={() => setActiveStage('screenplay')} />
        )}
      </main>

      {/* Footer Status Bar */}
      <footer className="bg-zinc-950 border-t border-zinc-900 px-4 py-2.5 text-[11px] text-zinc-500 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-mono">
          <span className="text-zinc-300 font-semibold">M-b AI Film Studio</span>
          <span>•</span>
          <span>Target: {formatDurationNice(project.targetDurationSeconds)}</span>
          <span>•</span>
          <span>
            Ready Clips: {timelineAccess.readyClips}/{timelineAccess.totalClips}
          </span>
          <span>•</span>
          <span>Engine: {providerSpec.name}</span>
          {!isTargetMatched && (
            <button
              type="button"
              onClick={handleAutoBalanceTimeline}
              className="inline-flex items-center space-x-1 text-amber-400 hover:text-amber-300 underline"
            >
              <Zap className="w-3 h-3" />
              <span>Balance {delta > 0 ? `+${delta}s` : `${delta}s`}</span>
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2 font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              timelineAccess.unlocked ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          <span>
            {timelineAccess.unlocked ? 'Timeline Unlocked' : 'Timeline Locked (Awaiting Videos)'}
          </span>
        </div>
      </footer>
    </div>
  );
}
