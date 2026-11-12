import React, { useState } from 'react';
import { FilmProject, PROVIDER_SPECS } from '../types/film';
import { formatDurationNice } from '../utils/timecode';
import {
  Layers,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Zap,
} from 'lucide-react';

interface SceneBreakdownViewProps {
  project: FilmProject;
  onSelectShot: (shotId: string) => void;
  onUpdateShotDuration: (shotId: string, newDuration: number) => void;
  onAutoBalanceTimeline: () => void;
  onApproveBreakdown?: () => void;
  onProceedToCharacters?: () => void;
}

export const SceneBreakdownView: React.FC<SceneBreakdownViewProps> = ({
  project,
  onSelectShot,
  onUpdateShotDuration,
  onAutoBalanceTimeline,
  onApproveBreakdown,
  onProceedToCharacters,
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
    <div className="bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl p-5 sm:p-6 text-zinc-100 space-y-6">
      {/* Header Summary */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 uppercase tracking-widest mb-1">
            <Layers className="w-4 h-4" />
            <span>Stage 2 — Scene Breakdown & Shot Approval</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Scene & Shot Production Breakdown
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
            Validated against target duration of <strong>{formatDurationNice(target)}</strong> ({target}s). Shots exceeding {providerSpec.maxClipDuration}s are cleanly subdivided into continuous clip segments.
          </p>
        </div>

        {/* Validation + Approval Actions */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center space-x-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5">
            <div>
              <div className="text-[10px] text-zinc-400 uppercase font-semibold">Breakdown Total</div>
              <div className="text-sm font-bold font-mono text-cyan-300 tabular-nums">
                {formatDurationNice(assembled)} / {formatDurationNice(target)}
              </div>
            </div>
            <div className="h-7 w-px bg-zinc-800" />
            <div className="flex items-center gap-1.5 text-xs">
              {isExact ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Matched</span>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onAutoBalanceTimeline}
                  className="text-amber-300 hover:text-amber-200 font-bold flex items-center gap-1"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Auto-Match ({delta > 0 ? `+${delta}s` : `${delta}s`})</span>
                </button>
              )}
            </div>
          </div>

          {onApproveBreakdown && (
            <button
              type="button"
              onClick={onApproveBreakdown}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                project.breakdownApproved
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{project.breakdownApproved ? 'Breakdown Approved' : 'Approve Breakdown'}</span>
            </button>
          )}

          {onProceedToCharacters && (
            <button
              type="button"
              onClick={onProceedToCharacters}
              className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-bold flex items-center gap-1.5"
            >
              <span>Characters & Locations</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Acts Progression Bar */}
      <div className="space-y-2 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/80">
        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          Act Structure ({project.acts.length} Acts)
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
                  <span className="font-mono text-cyan-400 tabular-nums">{formatDurationNice(actDuration)}</span>
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
                className="p-4 bg-zinc-900/80 hover:bg-zinc-800/80 cursor-pointer flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/60"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-zinc-400">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                  <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    Scene {scene.sceneNumber}
                  </span>
                  <span className="font-bold text-sm text-white">{scene.heading}</span>
                </div>

                <div className="flex items-center space-x-3 text-xs font-mono tabular-nums">
                  <span className="text-zinc-400">{scene.timeOfDay}</span>
                  <span className="text-zinc-400">
                    {scene.shots.length} shots ({sceneClipsCount} clips)
                  </span>
                  <span className="text-cyan-400 bg-cyan-950/60 px-2.5 py-0.5 rounded font-bold border border-cyan-500/30">
                    {formatDurationNice(scene.calculatedDuration)}
                  </span>
                </div>
              </div>

              {isExpanded && (
                <div className="p-4 space-y-4">
                  <div className="text-xs text-zinc-300 italic bg-black/30 p-2.5 rounded border border-zinc-800/60">
                    <strong>Scene Summary:</strong> {scene.summary} (Mood: {scene.mood})
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {scene.shots.map((shot) => {
                      const shotClips = project.clips.filter((c) => c.shotId === shot.shotId);
                      const isSubdivided = shotClips.length > 1;

                      return (
                        <div
                          key={shot.shotId}
                          className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col md:flex-row md:items-start justify-between gap-4"
                        >
                          <div className="flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-cyan-400">
                                Shot #{shot.shotNumber}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-zinc-800 text-xs font-medium text-white border border-zinc-700">
                                {shot.shotType}
                              </span>
                              <span className="text-xs text-emerald-400 font-mono">{shot.cameraMovement}</span>
                              <span className="text-xs text-purple-400 font-mono">{shot.angle}</span>
                              {isSubdivided && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/80 text-purple-300 border border-purple-500/40">
                                  Subdivided: {shotClips.length} clips
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-zinc-300 leading-relaxed">{shot.description}</p>

                            {shot.dialogueSnippet && (
                              <div className="text-xs text-amber-300/90 font-mono pl-3 border-l-2 border-amber-500">
                                <span className="font-bold">{shot.dialogueSnippet.speaker}: </span>
                                <span>"{shot.dialogueSnippet.line}"</span>
                              </div>
                            )}
                          </div>

                          <div className="w-full md:w-56 bg-zinc-900 p-3 rounded-lg border border-zinc-800 shrink-0 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-zinc-400">Shot Duration</span>
                              <span className="font-mono font-bold text-cyan-300 tabular-nums">
                                {shot.targetDuration.toFixed(1)}s
                              </span>
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

                            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
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
                              <button
                                type="button"
                                onClick={() => onSelectShot(shot.shotId)}
                                className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
                              >
                                Inspect
                              </button>
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
