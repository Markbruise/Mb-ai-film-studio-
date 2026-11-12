import React, { useState } from 'react';
import {
  FilmProject,
  StoryboardFrame,
  StudioLanguage,
} from '../types/film';
import { t } from '../utils/i18n';
import {
  CheckCircle2,
  XCircle,
  Sparkles,
  Loader2,
  ArrowRight,
  Lock,
  Image as ImageIcon,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

interface StoryboardStudioProps {
  project: FilmProject;
  uiLanguage: StudioLanguage;
  onUpdateProject: React.Dispatch<React.SetStateAction<FilmProject>>;
  onProceedToVideoProduction: () => void;
}

export const StoryboardStudio: React.FC<StoryboardStudioProps> = ({
  project,
  uiLanguage,
  onUpdateProject,
  onProceedToVideoProduction,
}) => {
  const [generatingFrameId, setGeneratingFrameId] = useState<string | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const frames: StoryboardFrame[] = project.storyboardFrames || [];
  const approvedCount = frames.filter((f) => f.approvalStatus === 'approved').length;
  const rejectedCount = frames.filter((f) => f.approvalStatus === 'rejected').length;
  const isGatePassed = frames.length > 0 && approvedCount === frames.length;

  const updateFrames = (next: StoryboardFrame[], forceApproved?: boolean) => {
    const allApproved = typeof forceApproved === 'boolean'
      ? forceApproved
      : next.length > 0 && next.every((f) => f.approvalStatus === 'approved');

    onUpdateProject((prev) => {
      // Sync frame descriptions & lighting back into shots and queued clips
      const updatedShots = prev.shots.map((sh) => {
        const matched = next.find((f) => f.shotId === sh.shotId);
        if (!matched) return sh;
        return {
          ...sh,
          description: matched.description,
          shotType: (matched.shotType as any) || sh.shotType,
          angle: (matched.cameraAngle as any) || sh.angle,
          cameraMovement: (matched.cameraMovement as any) || sh.cameraMovement,
        };
      });

      const updatedClips = prev.clips.map((clip) => {
        const matched = next.find((f) => f.shotId === clip.shotId);
        if (!matched) return clip;
        return {
          ...clip,
          prompt: `Cinematic ${matched.shotType}, ${matched.cameraAngle}, ${matched.cameraMovement}. ${matched.description}. Lighting: ${matched.lightingNotes}. Visual Style: ${prev.visualStyle || 'Cinematic Realism'}.`,
          firstFrameImage: matched.imageUrl || clip.firstFrameImage,
        };
      });

      return {
        ...prev,
        storyboardFrames: next,
        storyboardApproved: allApproved,
        shots: updatedShots,
        clips: updatedClips,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleGenerateFrameArt = async (frame: StoryboardFrame) => {
    setGeneratingFrameId(frame.frameId);
    setErrorMsg(null);
    try {
      // Find primary character ref image if available for visual consistency
      const shot = project.shots.find((s) => s.shotId === frame.shotId);
      const charProfile = (project.characterProfiles || []).find((c) =>
        shot?.characters?.some((sc) => sc.toLowerCase().includes(c.name.toLowerCase()))
      ) || project.characterProfiles?.[0];

      const charText = charProfile
        ? `Character ${charProfile.name}: ${charProfile.appearance}, wearing ${charProfile.costume}.`
        : '';

      const prompt = `Storyboard keyframe cinematic still (${project.visualStyle || 'Cinematic Realism'}). Shot framing: ${frame.shotType}, camera angle: ${frame.cameraAngle}, motion: ${frame.cameraMovement}. Action: ${frame.description}. ${charText} Composition: ${frame.composition}. Lighting: ${frame.lightingNotes}.`;

      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          aspectRatio: project.aspectRatio === '9:16' ? '9:16' : project.aspectRatio === '1:1' ? '1:1' : '16:9',
          imageSize: '1K',
          base64Image: charProfile?.referenceImageUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Storyboard frame generation failed');

      updateFrames(
        frames.map((f) =>
          f.frameId === frame.frameId ? { ...f, imageUrl: data.imageUrl } : f
        )
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to generate storyboard image');
    } finally {
      setGeneratingFrameId(null);
    }
  };

  const handleGenerateMissingFrames = async () => {
    const missing = frames.filter((f) => !f.imageUrl);
    if (missing.length === 0) return;
    setIsBatchGenerating(true);
    setErrorMsg(null);
    let working = [...frames];

    for (const frame of missing) {
      setGeneratingFrameId(frame.frameId);
      try {
        const res = await fetch('/api/generate/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: `Cinematic storyboard still (${project.visualStyle || 'Cinematic Realism'}): ${frame.shotType}, ${frame.cameraAngle}. ${frame.description}. Lighting: ${frame.lightingNotes}.`,
            aspectRatio: project.aspectRatio === '9:16' ? '9:16' : project.aspectRatio === '1:1' ? '1:1' : '16:9',
            imageSize: '1K',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Storyboard batch generation failed');
        }
        if (data.imageUrl) {
          working = working.map((f) =>
            f.frameId === frame.frameId ? { ...f, imageUrl: data.imageUrl } : f
          );
          updateFrames(working);
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'Batch storyboard generation encountered an error');
        break;
      }
    }
    setGeneratingFrameId(null);
    setIsBatchGenerating(false);
  };

  const handleSetFrameApproval = (frameId: string, status: 'approved' | 'rejected') => {
    updateFrames(
      frames.map((f) =>
        f.frameId === frameId
          ? {
              ...f,
              approvalStatus: status,
              approvedAt: status === 'approved' ? new Date().toISOString() : undefined,
            }
          : f
      )
    );
  };

  const handleApproveAllFrames = () => {
    const now = new Date().toISOString();
    updateFrames(
      frames.map((f) => ({ ...f, approvalStatus: 'approved', approvedAt: now })),
      true
    );
  };

  return (
    <div className="bg-zinc-950 rounded-2xl border border-zinc-800 p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-5 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-amber-400 mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>{t(uiLanguage, 'storyboardGateTitle')}</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Storyboard Studio & Shot Approval</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
            {t(uiLanguage, 'storyboardGateBody')} Edit camera angles, composition, lighting notes, and generate visual keyframes before video synthesis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {frames.some((f) => !f.imageUrl) && (
            <button
              type="button"
              disabled={isBatchGenerating}
              onClick={handleGenerateMissingFrames}
              className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-white flex items-center gap-2 disabled:opacity-50"
            >
              {isBatchGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>Generate All Frames</span>
            </button>
          )}

          {!isGatePassed && (
            <button
              type="button"
              onClick={handleApproveAllFrames}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{t(uiLanguage, 'approveAllFrames')}</span>
            </button>
          )}

          <button
            type="button"
            disabled={!isGatePassed}
            onClick={onProceedToVideoProduction}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              isGatePassed
                ? 'bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-lg'
                : 'bg-zinc-900 text-zinc-500 border border-zinc-800 cursor-not-allowed'
            }`}
          >
            {!isGatePassed && <Lock className="w-3.5 h-3.5" />}
            <span>Proceed to AI Video Generation</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Approval Status Bar */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
          isGatePassed
            ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-200'
            : 'bg-amber-950/20 border-amber-500/35 text-amber-200'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {isGatePassed ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          )}
          <span>
            {isGatePassed
              ? `All ${frames.length} storyboard frames are approved. AI Video Production Center is ready.`
              : `${approvedCount}/${frames.length} storyboard frames approved${rejectedCount > 0 ? ` (${rejectedCount} flagged for revision)` : ''}. Approve every shot frame to unlock batch AI video generation.`}
          </span>
        </div>
        <span className="font-mono font-bold tabular-nums shrink-0">
          {approvedCount}/{frames.length} Approved
        </span>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Scenes & Storyboard Grid */}
      <div className="space-y-8">
        {project.scenes.map((scene) => {
          const sceneFrames = frames.filter((f) => f.sceneId === scene.sceneId);
          return (
            <div key={scene.sceneId} className="space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono font-bold text-cyan-400">
                    Scene {scene.sceneNumber}
                  </span>
                  <h3 className="text-sm font-bold text-white">{scene.heading}</h3>
                </div>
                <span className="text-xs font-mono text-zinc-500">{sceneFrames.length} Shots</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sceneFrames.map((frame) => {
                  const isBusy = generatingFrameId === frame.frameId;
                  return (
                    <div
                      key={frame.frameId}
                      className={`rounded-xl border p-4 flex flex-col justify-between gap-3 transition ${
                        frame.approvalStatus === 'approved'
                          ? 'bg-zinc-900/50 border-emerald-500/35'
                          : frame.approvalStatus === 'rejected'
                          ? 'bg-rose-950/15 border-rose-500/40'
                          : 'bg-zinc-900/40 border-zinc-800'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Frame Visual Box */}
                        <div className="aspect-video rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden relative flex items-center justify-center">
                          {frame.imageUrl ? (
                            <img
                              src={frame.imageUrl}
                              alt={frame.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center p-4 text-xs text-zinc-500 space-y-1.5">
                              <ImageIcon className="w-6 h-6 mx-auto text-zinc-700" />
                              <div>Shot #{frame.frameNumber} — Generate Frame Preview</div>
                            </div>
                          )}

                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-zinc-200 border border-zinc-700">
                            #{frame.frameNumber} • {frame.shotType}
                          </span>
                          <span
                            className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                              frame.approvalStatus === 'approved'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : frame.approvalStatus === 'rejected'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            {frame.approvalStatus}
                          </span>
                        </div>

                        {/* Controls: Angle & Camera Movement */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <select
                            value={frame.cameraAngle}
                            onChange={(e) =>
                              updateFrames(
                                frames.map((f) =>
                                  f.frameId === frame.frameId ? { ...f, cameraAngle: e.target.value } : f
                                )
                              )
                            }
                            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-200"
                          >
                            {['Eye Level', 'Low Angle', 'High Angle', 'Dutch Angle', 'Birds Eye'].map((a) => (
                              <option key={a} value={a}>{a}</option>
                            ))}
                          </select>

                          <select
                            value={frame.cameraMovement}
                            onChange={(e) =>
                              updateFrames(
                                frames.map((f) =>
                                  f.frameId === frame.frameId ? { ...f, cameraMovement: e.target.value } : f
                                )
                              )
                            }
                            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-200"
                          >
                            {[
                              'Static',
                              'Push In / Dolly',
                              'Pull Back',
                              'Pan Left',
                              'Pan Right',
                              'Tilt Up',
                              'Tilt Down',
                              'Steadicam Follow',
                              'Orbital Crane',
                            ].map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>

                        <textarea
                          rows={2}
                          value={frame.description}
                          onChange={(e) =>
                            updateFrames(
                              frames.map((f) =>
                                f.frameId === frame.frameId ? { ...f, description: e.target.value } : f
                              )
                            )
                          }
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 leading-relaxed"
                          placeholder="Shot action & visual description..."
                        />

                        <input
                          type="text"
                          value={frame.lightingNotes}
                          onChange={(e) =>
                            updateFrames(
                              frames.map((f) =>
                                f.frameId === frame.frameId ? { ...f, lightingNotes: e.target.value } : f
                              )
                            )
                          }
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-300"
                          placeholder="Lighting & color key..."
                        />
                      </div>

                      {/* Footer Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/80">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleGenerateFrameArt(frame)}
                            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            )}
                            <span>{frame.imageUrl ? 'Regenerate' : 'Generate Art'}</span>
                          </button>

                          <label
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 cursor-pointer transition"
                            title="Upload custom storyboard frame image"
                          >
                            Upload
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const dataUrl = String(reader.result || '');
                                  if (dataUrl) {
                                    updateFrames(
                                      frames.map((f) =>
                                        f.frameId === frame.frameId ? { ...f, imageUrl: dataUrl } : f
                                      )
                                    );
                                  }
                                };
                                reader.readAsDataURL(file);
                              }}
                            />
                          </label>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSetFrameApproval(frame.frameId, 'rejected')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1 ${
                              frame.approvalStatus === 'rejected'
                                ? 'bg-rose-600 text-white border-rose-500'
                                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-rose-300'
                            }`}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Revise</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetFrameApproval(frame.frameId, 'approved')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1 ${
                              frame.approvalStatus === 'approved'
                                ? 'bg-emerald-600 text-white border-emerald-500'
                                : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-emerald-500/50 hover:text-emerald-300'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
