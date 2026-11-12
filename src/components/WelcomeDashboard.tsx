import React, { useState } from 'react';
import {
  FilmProject,
  ProviderId,
  PROVIDER_SPECS,
  StudioLanguage,
  VisualStylePreset,
  WorkflowStage,
  evaluateTimelineAccess,
} from '../types/film';
import { formatDurationNice } from '../utils/timecode';
import { SUPPORTED_LANGUAGES, t } from '../utils/i18n';
import {
  Film,
  Plus,
  Play,
  FolderOpen,
  Sparkles,
  Image as ImageIcon,
  Settings,
  HelpCircle,
  Clock,
  Layers,
  CheckCircle2,
  Lock,
  Unlock,
  ArrowRight,
  Cpu,
  X,
  Wand2,
} from 'lucide-react';

interface WelcomeDashboardProps {
  activeProject: FilmProject;
  projects: FilmProject[];
  uiLanguage: StudioLanguage;
  onSelectProject: (project: FilmProject) => void;
  onCreateNewProject: (params: {
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
  }) => Promise<void>;
  onNavigate: (stage: WorkflowStage) => void;
  isCreating?: boolean;
}

const DURATION_QUICK_MARKS = [
  { label: '15s', seconds: 15 },
  { label: '30s', seconds: 30 },
  { label: '60s', seconds: 60 },
  { label: '3m', seconds: 180 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '60m', seconds: 3600 },
  { label: '120m', seconds: 7200 },
];

const VISUAL_STYLES: VisualStylePreset[] = [
  'Cinematic Realism',
  'Sci-Fi Anamorphic',
  'Neo-Noir',
  'Classic 35mm Film',
  'Documentary',
  'Vibrant Animation',
];

export const WelcomeDashboard: React.FC<WelcomeDashboardProps> = ({
  activeProject,
  projects,
  uiLanguage,
  onSelectProject,
  onCreateNewProject,
  onNavigate,
  isCreating = false,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Film Creation Wizard State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('Sci-Fi Drama');
  const [screenplayLanguage, setScreenplayLanguage] = useState<StudioLanguage>(uiLanguage || 'en');
  const [outputLanguage, setOutputLanguage] = useState<StudioLanguage>(uiLanguage || 'en');
  const [targetDurationSeconds, setTargetDurationSeconds] = useState<number>(60);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1' | '2.39:1'>('16:9');
  const [resolution, setResolution] = useState<'720p' | '1080p' | '4K Cinema'>('1080p');
  const [visualStyle, setVisualStyle] = useState<VisualStylePreset>('Cinematic Realism');
  const [targetAudience, setTargetAudience] = useState('Global Cinema Audience');
  const [provider, setProvider] = useState<ProviderId>('gemini-omni');
  const [autoGenerateScript, setAutoGenerateScript] = useState<boolean>(true);
  const [createError, setCreateError] = useState<string | null>(null);

  const timelineStatus = evaluateTimelineAccess(activeProject);
  const approvedFrames = (activeProject.storyboardFrames || []).filter((f) => f.approvalStatus === 'approved').length;
  const totalFrames = (activeProject.storyboardFrames || []).length;

  const progressSteps = [
    {
      stage: 'screenplay' as WorkflowStage,
      label: t(uiLanguage, 'navScript'),
      done: Boolean(activeProject.screenplayRaw?.trim()),
    },
    {
      stage: 'breakdown' as WorkflowStage,
      label: t(uiLanguage, 'navBreakdown'),
      done: Boolean(activeProject.breakdownApproved || activeProject.scenes.length > 0),
    },
    {
      stage: 'characters' as WorkflowStage,
      label: t(uiLanguage, 'navCharacters'),
      done: (activeProject.characterProfiles?.length || 0) > 0,
    },
    {
      stage: 'storyboard' as WorkflowStage,
      label: t(uiLanguage, 'navStoryboard'),
      done: Boolean(activeProject.storyboardApproved || (totalFrames > 0 && approvedFrames === totalFrames)),
    },
    {
      stage: 'production' as WorkflowStage,
      label: t(uiLanguage, 'navVideoGen'),
      done: timelineStatus.unlocked,
    },
    {
      stage: 'timeline' as WorkflowStage,
      label: t(uiLanguage, 'navTimeline'),
      done: timelineStatus.unlocked,
      locked: !timelineStatus.unlocked,
    },
    {
      stage: 'audio' as WorkflowStage,
      label: t(uiLanguage, 'navAudio'),
      done: activeProject.dialogueTracks.length > 0 || activeProject.musicTracks.length > 0,
    },
    {
      stage: 'export' as WorkflowStage,
      label: t(uiLanguage, 'navExport'),
      done: activeProject.status === 'exported',
    },
  ];

  const completedStepCount = progressSteps.filter((s) => s.done).length;
  const recentProjects = projects.filter((p) => !p.archived).slice(0, 6);

  const handleSubmitNewFilm = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!title.trim()) {
      setCreateError('Please enter a film title.');
      return;
    }
    try {
      await onCreateNewProject({
        title: title.trim(),
        description: description.trim() || `An original ${genre} film in ${visualStyle} style.`,
        genre: genre.trim() || 'Cinematic Drama',
        screenplayLanguage,
        outputLanguage,
        targetDurationSeconds: Math.max(4, Math.min(7200, targetDurationSeconds)),
        aspectRatio,
        resolution,
        visualStyle,
        targetAudience: targetAudience.trim() || 'General Audience',
        provider,
        autoGenerateScript,
      });
      setShowCreateModal(false);
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create project');
    }
  };

  return (
    <div className="space-y-8 pb-6">
      {/* CINEMATIC VIDEO HERO BANNER */}
      <section className="relative rounded-2xl overflow-hidden border border-zinc-800/90 bg-[#07090d] shadow-2xl min-h-[340px] sm:min-h-[400px] flex items-end">
        <video
          src="/uploads/clip_1794238508058.mp4"
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-45 scale-105"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(7,9,13,0.45) 0%, rgba(7,9,13,0.72) 48%, rgba(7,9,13,0.98) 100%), linear-gradient(90deg, rgba(7,9,13,0.92) 0%, rgba(7,9,13,0.5) 55%, rgba(7,9,13,0.2) 100%)',
          }}
        />

        <div className="relative z-10 w-full p-6 sm:p-8 lg:p-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-amber-400">
              <Film className="w-4 h-4" />
              <span>{t(uiLanguage, 'brandName')}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.08]">
              {t(uiLanguage, 'welcomeMessage')}
            </h1>

            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-xl">
              {t(uiLanguage, 'welcomeSub')}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="min-h-[46px] px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition active:scale-[0.99]"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>{t(uiLanguage, 'startNewFilm')}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate(timelineStatus.unlocked ? 'timeline' : 'screenplay')}
                className="min-h-[46px] px-5 py-3 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-white font-semibold text-sm border border-zinc-700 flex items-center gap-2 transition"
              >
                <Play className="w-4 h-4 text-cyan-400" />
                <span>{t(uiLanguage, 'resumeCurrent')}: {activeProject.title}</span>
              </button>
            </div>
          </div>

          {/* Active Production Telemetry Panel */}
          <div className="bg-zinc-950/85 backdrop-blur-md border border-zinc-800 rounded-xl p-4 w-full lg:w-80 shrink-0 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                {t(uiLanguage, 'productionProgress')}
              </span>
              <span className="text-xs font-mono font-bold text-cyan-400 tabular-nums">
                {completedStepCount}/{progressSteps.length} Stages
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-bold text-white truncate">{activeProject.title}</div>
              <div className="text-xs text-zinc-400 flex items-center justify-between font-mono tabular-nums">
                <span>{formatDurationNice(activeProject.targetDurationSeconds)}</span>
                <span>{activeProject.aspectRatio} • {activeProject.resolution}</span>
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 via-cyan-400 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.round((completedStepCount / progressSteps.length) * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className={timelineStatus.unlocked ? 'text-emerald-400 flex items-center gap-1' : 'text-amber-300 flex items-center gap-1'}>
                {timelineStatus.unlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                {timelineStatus.unlocked
                  ? `Timeline Unlocked (${timelineStatus.readyClips}/${timelineStatus.totalClips})`
                  : `Clips Ready: ${timelineStatus.readyClips}/${timelineStatus.totalClips}`}
              </span>
              <button
                type="button"
                onClick={() => onNavigate('production')}
                className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
              >
                <span>Open</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CORE DASHBOARD NAVIGATION TILES */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          {
            id: 'projects' as WorkflowStage,
            title: t(uiLanguage, 'myProjects'),
            desc: `${projects.length} saved film project${projects.length === 1 ? '' : 's'}`,
            icon: FolderOpen,
            accent: 'text-amber-400',
          },
          {
            id: 'production' as WorkflowStage,
            title: t(uiLanguage, 'aiProductionCenter'),
            desc: `${timelineStatus.readyClips}/${timelineStatus.totalClips} verified video clips`,
            icon: Cpu,
            accent: 'text-cyan-400',
          },
          {
            id: 'assets' as WorkflowStage,
            title: t(uiLanguage, 'mediaAssetLibrary'),
            desc: 'Characters, stills, clips, audio & exports',
            icon: ImageIcon,
            accent: 'text-indigo-400',
          },
          {
            id: 'settings' as WorkflowStage,
            title: t(uiLanguage, 'settings'),
            desc: 'AI model diagnostics & language',
            icon: Settings,
            accent: 'text-emerald-400',
          },
          {
            id: 'help' as WorkflowStage,
            title: t(uiLanguage, 'helpTutorials'),
            desc: 'Workflow guides & render tips',
            icon: HelpCircle,
            accent: 'text-zinc-300',
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onNavigate(card.id)}
              className="text-left p-4 rounded-xl bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition flex flex-col justify-between gap-3 min-h-[104px]"
            >
              <div className="flex items-center justify-between">
                <Icon className={`w-5 h-5 ${card.accent}`} />
                <ArrowRight className="w-4 h-4 text-zinc-600" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">{card.title}</div>
                <div className="text-xs text-zinc-400 mt-0.5 leading-snug">{card.desc}</div>
              </div>
            </button>
          );
        })}
      </section>

      {/* GUIDED FILMMAKING PIPELINE MAP */}
      <section className="bg-zinc-950 border border-zinc-800/90 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>{t(uiLanguage, 'productionProgress')}: {activeProject.title}</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Follow each stage sequentially. Timeline editing unlocks automatically once 100% of shot clips are verified MP4 files.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-400 tabular-nums">
            Target Runtime: <strong className="text-white">{formatDurationNice(activeProject.targetDurationSeconds)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {progressSteps.map((step, idx) => (
            <button
              key={step.stage}
              type="button"
              onClick={() => onNavigate(step.stage)}
              className={`p-3 rounded-xl border text-left transition flex flex-col justify-between min-h-[76px] ${
                step.locked
                  ? 'bg-zinc-950 border-zinc-800/80 text-zinc-500 hover:border-amber-500/40'
                  : step.done
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-zinc-100 hover:border-emerald-400/60'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-zinc-500">0{idx + 1}</span>
                {step.locked ? (
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                ) : step.done ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-zinc-500" />
                )}
              </div>
              <div className="text-xs font-semibold truncate">{step.label}</div>
            </button>
          ))}
        </div>
      </section>

      {/* RECENT PROJECTS GRID */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{t(uiLanguage, 'recentProjects')}</h2>
          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            <span>View all</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentProjects.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-zinc-800 text-center text-sm text-zinc-400">
            No saved projects yet. Click "{t(uiLanguage, 'startNewFilm')}" to create your first film.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentProjects.map((proj) => {
              const status = evaluateTimelineAccess(proj);
              const pct = status.totalClips > 0 ? Math.round((status.readyClips / status.totalClips) * 100) : 0;
              const isCurrent = proj.id === activeProject.id;

              return (
                <div
                  key={proj.id}
                  className={`rounded-xl border p-5 flex flex-col justify-between gap-4 transition ${
                    isCurrent
                      ? 'bg-zinc-900/90 border-cyan-500/50 shadow-lg'
                      : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-white leading-tight">{proj.title}</h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {proj.genre} • {proj.visualStyle || 'Cinematic Realism'}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-400 tabular-nums shrink-0">
                        {formatDurationNice(proj.targetDurationSeconds)}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {proj.description || proj.logline}
                    </p>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-zinc-800/80">
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 tabular-nums">
                      <span>{proj.scenes.length} Scenes • {status.totalClips} Clips</span>
                      <span className={pct === 100 ? 'text-emerald-400' : 'text-amber-300'}>{pct}% Video Ready</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full transition-all ${pct === 100 ? 'bg-emerald-400' : 'bg-cyan-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-zinc-500">
                        {proj.aspectRatio} • {proj.resolution}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProject(proj);
                          onNavigate(status.unlocked ? 'timeline' : 'screenplay');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition"
                      >
                        {isCurrent ? 'Continue' : 'Open Project'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* NEW FILM PROJECT CREATION MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden my-auto">
            <div className="px-6 py-4 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold text-white">Create New Film Project</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitNewFilm} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              {createError && (
                <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
                  {createError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1.5">Film Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Kigali Horizon"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1.5">Genre</label>
                  <input
                    type="text"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    placeholder="Sci-Fi, Drama, Action, Documentary"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
                  Film Premise / Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your film idea, characters, setting, and central conflict..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Duration 4s - 120m */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-200">Film Duration (4 seconds – 120 minutes)</span>
                  <span className="font-mono font-bold text-cyan-400 tabular-nums">
                    {formatDurationNice(targetDurationSeconds)} ({targetDurationSeconds}s)
                  </span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={7200}
                  step={targetDurationSeconds > 300 ? 30 : targetDurationSeconds > 60 ? 5 : 1}
                  value={targetDurationSeconds}
                  onChange={(e) => setTargetDurationSeconds(parseInt(e.target.value, 10))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {DURATION_QUICK_MARKS.map((m) => (
                      <button
                        type="button"
                        key={m.seconds}
                        onClick={() => setTargetDurationSeconds(m.seconds)}
                        className={`px-2.5 py-1 rounded text-xs font-mono border transition ${
                          targetDurationSeconds === m.seconds
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-zinc-500">Exact (s):</span>
                    <input
                      type="number"
                      min={4}
                      max={7200}
                      value={targetDurationSeconds}
                      onChange={(e) =>
                        setTargetDurationSeconds(Math.max(4, Math.min(7200, Number(e.target.value) || 4)))
                      }
                      className="w-20 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-right font-mono text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Languages & Formats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Screenplay Language</label>
                  <select
                    value={screenplayLanguage}
                    onChange={(e) => setScreenplayLanguage(e.target.value as StudioLanguage)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label} ({l.nativeLabel})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Output / Voice Language</label>
                  <select
                    value={outputLanguage}
                    onChange={(e) => setOutputLanguage(e.target.value as StudioLanguage)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label} ({l.nativeLabel})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Aspect Ratio</label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    <option value="16:9">16:9 Widescreen</option>
                    <option value="9:16">9:16 Vertical / Mobile</option>
                    <option value="1:1">1:1 Square Social</option>
                    <option value="2.39:1">2.39:1 CinemaScope</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Resolution</label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    <option value="1080p">1080p Full HD</option>
                    <option value="720p">720p HD</option>
                    <option value="4K Cinema">4K Cinema</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Visual Style</label>
                  <select
                    value={visualStyle}
                    onChange={(e) => setVisualStyle(e.target.value as VisualStylePreset)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    {VISUAL_STYLES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Target Audience</label>
                  <input
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="Young Adult, Festival Jury, Commercial"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Primary Video Engine</label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as ProviderId)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    {(Object.keys(PROVIDER_SPECS) as ProviderId[]).map((pid) => (
                      <option key={pid} value={pid}>
                        {PROVIDER_SPECS[pid].name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-900/70 border border-zinc-800 cursor-pointer text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={autoGenerateScript}
                  onChange={(e) => setAutoGenerateScript(e.target.checked)}
                  className="mt-0.5 accent-amber-500"
                />
                <span>
                  <strong className="text-white block">Draft Initial AI Screenplay Immediately</strong>
                  Uses connected screenplay model in {SUPPORTED_LANGUAGES.find((l) => l.code === screenplayLanguage)?.label || screenplayLanguage} based on your premise.
                </span>
              </label>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
                      <span>Creating Project...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      <span>Create Project & Open Script Studio</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
