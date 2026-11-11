import React, { useState } from 'react';
import { FilmProject, Scene, Shot, VideoClip, PROVIDER_SPECS } from '../types/film';
import { formatDurationNice, formatSMPTETimecode } from '../utils/timecode';
import {
  Layers,
  Film,
  Camera,
  Compass,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Sliders,
} from 'lucide-react';

interface SceneBreakdownViewProps {
  project: FilmProject;
  onSelectShot: (shotId: string) => void;
  onUpdateShotDuration: (shotId: string, newDuration: number) => void;
  onAutoBalanceTimeline: () => void;
}

export const SceneBreakdownView: React.FC<SceneBreakdownViewProps> = ({
  project,
  onSelectShot,
  onUpdateShotDuration,
  onAutoBalanceTimeline,
}) => {
  const [expandedScenes, setExpandedScenes] = useState<Record<string, boolean>>({
    [project.scenes[0]?.sceneId || '']: true,
  });

  const toggleScene = (sceneId: string) => {
    setExpandedScenes((prev) => ({
      ...prev,
      [sceneId]: !prev[sceneId],
    }));
  };

  const providerSpec = PROVIDER_SPECS[project.defaultProvider] || PROVIDER_SPECS['gemini-omni'];
  const target = project.targetDurationSeconds;
  const assembled = project.actualAssembledDuration;
  const delta = Math.round((assembled - target) * 10) / 10;
  const isExact = Math.abs(delta) <= 0.5;

  return (
    <div className="bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl p-6 text-zinc-100 space-y-6">
      {/* Header Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-1">
            <Layers className="w-4 h-4" />
            <span>Step 2: Narrative Hierarchy & Shot Pacing</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Scene & Shot Production Breakdown
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Validated against target duration of <strong>{formatDurationNice(target)}</strong> ({target}s). Shots exceeding provider maximum of {providerSpec.maxClipDuration}s are subdivided into continuous clip segments.
          </p>
        </div>

        {/* Validation Status Card */}
        <div className="flex items-center space-x-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 shrink-0">
          <div>
            <div className="text-[11px] text-zinc-400 uppercase font-semibold">Total Breakdown Duration</div>
            <div className="text-lg font-bold font-mono text-cyan-300">
              {formatDurationNice(assembled)} / {formatDurationNice(target)}
            </div>
          </div>
          <div className="h-8 w-px bg-zinc-800" />
          <div>
            <div className="text-[11px] text-zinc-400 uppercase font-semibold">Validation</div>
            <div className="flex items-center space-x-1.5 text-xs font-medium">
              {isExact ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">100% Target Met</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-400 font-bold">
                    {delta > 0 ? `+${delta}s over` : `${delta}s under`}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Acts Progression Bar */}
      <div className="space-y-2 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/80">
        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          Act Structure Progression ({project.acts.length} Acts)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {project.acts.map((act) => {
            const actScenes = project.scenes.filter((s) => s.actId === act.actId);
            const actDuration = actScenes.reduce((acc, sc) => acc + sc.calculatedDuration, 0);
            const actClipsCount = actScenes.flatMap((s) => s.shots).flatMap((sh) => sh.clipIds).length;

            return (
              <div key={act.actId} className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{act.title}</span>
                  <span className="font-mono text-cyan-400">{formatDurationNice(actDuration)}</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">{act.summary}</p>
                <div className="flex items-center space-x-2 text-[10px] text-zinc-500 pt-1 border-t border-zinc-900">
                  <span>{actScenes.length} Scenes</span>
                  <span>•</span>
                  <span>{actClipsCount} Video Clips</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scenes List with Accordion */}
      <div className="space-y-4">
        {project.scenes.map((scene) => {
          const isExpanded = !!expandedScenes[scene.sceneId];
          const sceneClipsCount = scene.shots.flatMap((s) => s.clipIds).length;

          return (
            <div
              key={scene.sceneId}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden transition"
            >
              {/* Scene Header Row */}
              <div
                onClick={() => toggleScene(scene.sceneId)}
                className="p-4 bg-zinc-900/80 hover:bg-zinc-850 cursor-pointer flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/60"
              >
                <div className="flex items-center space-x-3">
                  <button className="text-zinc-400 hover:text-white">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    Scene {scene.sceneNumber}
                  </span>
                  <span className="font-bold text-sm text-white">{scene.heading}</span>
                </div>

                <div className="flex items-center space-x-4 text-xs font-mono">
                  <span className="text-zinc-400 bg-black/40 px-2 py-0.5 rounded">
                    Time: <strong className="text-zinc-200">{scene.timeOfDay}</strong>
                  </span>
                  <span className="text-zinc-400 bg-black/40 px-2 py-0.5 rounded">
                    Shots: <strong className="text-white">{scene.shots.length}</strong> ({sceneClipsCount} clips)
                  </span>
                  <span className="text-cyan-400 bg-cyan-950/60 px-2.5 py-0.5 rounded font-bold border border-cyan-500/30">
                    {formatDurationNice(scene.calculatedDuration)}
                  </span>
                </div>
              </div>

              {/* Scene Summary */}
              {isExpanded && (
                <div className="p-4 space-y-4">
                  <div className="text-xs text-zinc-300 italic bg-black/30 p-2.5 rounded border border-zinc-800/60">
                    <strong>Scene Beat:</strong> {scene.summary} (Mood: {scene.mood})
                  </div>

                  {/* Shots Table / Grid */}
                  <div className="grid grid-cols-1 gap-3">
                    {scene.shots.map((shot) => {
                      const shotClips = project.clips.filter((c) => c.shotId === shot.shotId);
                      const isSubdivided = shotClips.length > 1;

                      return (
                        <div
                          key={shot.shotId}
                          onClick={() => onSelectShot(shot.shotId)}
                          className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 transition flex flex-col md:flex-row md:items-start justify-between gap-4"
                        >
                          {/* Shot Info */}
                          <div className="flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-cyan-400">
                                Shot #{shot.shotNumber}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-zinc-800 text-xs font-medium text-white border border-zinc-700">
                                {shot.shotType}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-zinc-900 text-xs text-emerald-400 border border-zinc-800">
                                {shot.cameraMovement}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-zinc-900 text-xs text-purple-400 border border-zinc-800">
                                {shot.angle}
                              </span>
                              {isSubdivided && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/80 text-purple-300 border border-purple-500/40">
                                  Subdivided: {shotClips.length} clips (Provider max {providerSpec.maxClipDuration}s)
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                              {shot.description}
                            </p>

                            {/* Dialogue Snippet if present */}
                            {shot.dialogueSnippet && (
                              <div className="text-xs text-amber-300/90 font-mono pl-3 border-l-2 border-amber-500">
                                <span className="font-bold">{shot.dialogueSnippet.speaker}: </span>
                                <span>"{shot.dialogueSnippet.line}"</span>
                              </div>
                            )}

                            {/* Continuity Badges */}
                            <div className="flex items-center space-x-3 text-[11px] text-zinc-500 pt-1">
                              <span>Screen Direction: <strong className="text-zinc-300 capitalize">{shot.visualContinuity.screenDirection}</strong></span>
                              <span>•</span>
                              <span>Lighting: <strong className="text-zinc-300">{shot.visualContinuity.lightingKey.slice(0, 30)}...</strong></span>
                            </div>
                          </div>

                          {/* Duration adjustment & Sub-clips preview */}
                          <div className="w-full md:w-56 bg-zinc-900 p-3 rounded-lg border border-zinc-800 shrink-0 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-zinc-400">Shot Duration</span>
                              <span className="font-mono font-bold text-cyan-300">{shot.targetDuration.toFixed(1)}s</span>
                            </div>

                            <input
                              type="range"
                              min={2}
                              max={30}
                              step={0.5}
                              value={shot.targetDuration}
                              onChange={(e) => onUpdateShotDuration(shot.shotId, parseFloat(e.target.value))}
                              className="w-full accent-cyan-500 cursor-pointer"
                            />

                            {/* Sub-clip breakdown tags */}
                            <div className="pt-2 border-t border-zinc-800/80 space-y-1">
                              <div className="text-[10px] text-zinc-500 font-semibold uppercase">Clips in Shot:</div>
                              <div className="flex flex-wrap gap-1">
                                {shotClips.map((clip, idx) => (
                                  <span
                                    key={clip.clipId}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/60 text-zinc-300 border border-zinc-800"
                                  >
                                    C{idx + 1}: {clip.duration.toFixed(1)}s
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
