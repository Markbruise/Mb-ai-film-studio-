import React, { useState, useRef, useEffect } from 'react';
import {
  FilmProject,
  VideoClip,
  Shot,
  PROVIDER_SPECS,
  ProviderId,
} from '../types/film';
import { formatSMPTETimecode, formatDurationNice } from '../utils/timecode';
import {
  ZoomIn,
  ZoomOut,
  Sliders,
  Scissors,
  Trash2,
  RefreshCw,
  Sparkles,
  Layers,
  Volume2,
  Music,
  Mic,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Play,
  Film,
  Zap,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Upload,
} from 'lucide-react';

interface TimelineEditorProps {
  project: FilmProject;
  currentTime: number;
  onSeek: (seconds: number) => void;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  onUpdateClip: (updatedClip: VideoClip) => void;
  onRemoveClip: (clipId: string) => void;
  onReorderClips: (reorderedClips: VideoClip[]) => void;
  onAutoBalanceTimeline: () => void;
  onGenerateClip: (clipId: string) => void;
}

export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  project,
  currentTime,
  onSeek,
  selectedClipId,
  onSelectClip,
  onUpdateClip,
  onRemoveClip,
  onReorderClips,
  onAutoBalanceTimeline,
  onGenerateClip,
}) => {
  const timelineContainerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1000);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [draggedClipId, setDraggedClipId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isSynthesizingDlg, setIsSynthesizingDlg] = useState<boolean>(false);

  // Monitor container width for responsive Full View fitting
  useEffect(() => {
    if (!timelineContainerRef.current) return;
    const updateWidth = () => {
      if (timelineContainerRef.current) {
        setContainerWidth(timelineContainerRef.current.clientWidth);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(timelineContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const trackHeaderWidth = 180;
  const usableWidth = Math.max(300, containerWidth - trackHeaderWidth - 32);
  const assembled = project.actualAssembledDuration;

  // Zoom benchmarks:
  // Full View: Exactly fits the entire assembled duration into the visible timeline width
  const fullViewPps = Math.max(0.05, Math.min(80, usableWidth / Math.max(1, assembled)));
  // Frame View: Detailed frame-by-frame clip editing (10px - 14px per single frame)
  const frameViewPps = Math.max(160, project.fps * 10);

  // Default zoom starts at Full View
  const [pixelsPerSecond, setPixelsPerSecond] = useState<number>(fullViewPps);

  // When assembled duration changes, adapt pixelsPerSecond if user was in Full View
  useEffect(() => {
    setPixelsPerSecond((prev) => {
      // If previous zoom was very close to full view, maintain full view fit
      if (prev <= fullViewPps * 1.15) {
        return fullViewPps;
      }
      return Math.max(fullViewPps, Math.min(frameViewPps * 1.5, prev));
    });
  }, [assembled, usableWidth, fullViewPps, frameViewPps]);

  // Zoom mapping functions (logarithmic curve for natural feel)
  const ppsToPercent = (pps: number): number => {
    if (pps <= fullViewPps) return 0;
    if (pps >= frameViewPps) return 100;
    const ratio = frameViewPps / fullViewPps;
    if (ratio <= 1) return 0;
    const pct = (Math.log(pps / fullViewPps) / Math.log(ratio)) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  const percentToPps = (pct: number): number => {
    if (pct <= 0) return fullViewPps;
    if (pct >= 100) return frameViewPps;
    const ratio = frameViewPps / fullViewPps;
    return fullViewPps * Math.pow(ratio, pct / 100);
  };

  const isFullViewActive = pixelsPerSecond <= fullViewPps * 1.08;
  const isFrameViewActive = pixelsPerSecond >= frameViewPps * 0.92;

  // Switch to Full View preset
  const handleSwitchToFullView = () => {
    setPixelsPerSecond(fullViewPps);
    if (timelineContainerRef.current) {
      timelineContainerRef.current.scrollLeft = 0;
    }
  };

  // Switch to Frame View preset (centers playhead or selected clip)
  const handleSwitchToFrameView = () => {
    setPixelsPerSecond(frameViewPps);
    setTimeout(() => {
      if (timelineContainerRef.current) {
        const targetTime = selectedClip ? selectedClip.timelineStart : currentTime;
        const targetPx = trackHeaderWidth + targetTime * frameViewPps;
        timelineContainerRef.current.scrollLeft = Math.max(0, targetPx - containerWidth / 2);
      }
    }, 20);
  };

  // Continuous zoom slider change handler
  const handleZoomSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const newPps = percentToPps(val);
    setPixelsPerSecond(newPps);
  };

  // Frame Nudge Handler for frame-accurate clip editing
  const handleNudgeClipFrames = (clip: VideoClip, framesDelta: number) => {
    const providerSpec = PROVIDER_SPECS[clip.provider] || PROVIDER_SPECS['gemini-omni'];
    const frameDuration = 1 / project.fps;
    const candidateDuration = clip.duration + framesDelta * frameDuration;
    const bounded = Math.max(
      providerSpec.minClipDuration,
      Math.min(providerSpec.maxClipDuration, Math.round(candidateDuration * project.fps) / project.fps)
    );
    const updated: VideoClip = {
      ...clip,
      duration: Math.round(bounded * 100) / 100,
      outPoint: Math.round(bounded * 100) / 100,
    };
    onUpdateClip(updated);
  };

  // Footage upload handler for replacing clip with real video
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const clip = selectedClip;
    if (!file || !clip) return;

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const res = await fetch('/api/upload/video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clipId: clip.clipId,
              base64Data,
              filename: file.name,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Upload failed');

          const newDuration = data.duration || clip.duration;
          onUpdateClip({
            ...clip,
            videoUrl: data.videoUrl,
            duration: newDuration,
            outPoint: newDuration,
            generationStatus: 'completed',
            progress: 100,
          });
        } catch (postErr: any) {
          console.error('Upload error:', postErr);
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setIsUploading(false);
    }
  };


  // Synthesize Dialogue Speech Handler
  const handleSynthesizeDialogue = async () => {
    if (!selectedShot?.dialogueSnippet) return;
    setIsSynthesizingDlg(true);
    try {
      const res = await fetch('/api/audio/dialogue/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dialogueId: `dlg_${selectedShot.shotId}`,
          text: selectedShot.dialogueSnippet.line,
          character: selectedShot.dialogueSnippet.speaker,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Speech generation failed');

      // Update dialogue track in project if needed
      const existingDlg = project.dialogueTracks.find((d) => d.id === `dlg_${selectedShot.shotId}`);
      if (existingDlg) {
        existingDlg.audioUrl = data.audioUrl;
        existingDlg.duration = data.duration;
      }
    } catch (err) {
      console.error('Dialogue synthesis error:', err);
    } finally {
      setIsSynthesizingDlg(false);
    }
  };

  // Duration metrics
  const target = project.targetDurationSeconds;
  const delta = Math.round((assembled - target) * 10) / 10;
  const isTargetMatched = Math.abs(delta) <= 0.5;

  const totalClips = project.clips.length;
  const generatedClips = project.clips.filter((c) => c.generationStatus === 'completed').length;
  const pendingClips = project.clips.filter(
    (c) => c.generationStatus === 'queued' || c.generationStatus === 'generating'
  ).length;
  const failedClips = project.clips.filter((c) => c.generationStatus === 'failed').length;

  const selectedClip = project.clips.find((c) => c.clipId === selectedClipId);
  const selectedShot = selectedClip ? project.shots.find((s) => s.shotId === selectedClip.shotId) : null;
  const selectedScene = selectedClip ? project.scenes.find((sc) => sc.sceneId === selectedClip.sceneId) : null;

  // Timeline width in pixels
  const timelineContentWidth = isFullViewActive
    ? Math.max(containerWidth - 2, trackHeaderWidth + assembled * pixelsPerSecond + 20)
    : Math.max(containerWidth, trackHeaderWidth + assembled * pixelsPerSecond + 180);

  // Scrubber click/drag handler with frame-accurate snapping in Frame View
  const handleTimelineScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineContainerRef.current) return;
    const rect = timelineContainerRef.current.getBoundingClientRect();
    const scrollLeft = timelineContainerRef.current.scrollLeft;
    const clickX = e.clientX - rect.left + scrollLeft - trackHeaderWidth;
    if (clickX < 0) return;
    let time = Math.max(0, Math.min(assembled, clickX / pixelsPerSecond));
    if (isFrameViewActive) {
      // Frame-accurate snap
      time = Math.round(time * project.fps) / project.fps;
    }
    onSeek(time);
  };

  // Drag and drop reordering
  const handleDragStart = (e: React.DragEvent, clipId: string) => {
    setDraggedClipId(clipId);
    e.dataTransfer.setData('text/plain', clipId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetClipId: string) => {
    e.preventDefault();
    if (!draggedClipId || draggedClipId === targetClipId) return;

    const sourceIdx = project.clips.findIndex((c) => c.clipId === draggedClipId);
    const targetIdx = project.clips.findIndex((c) => c.clipId === targetClipId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const newClips = [...project.clips];
    const [moved] = newClips.splice(sourceIdx, 1);
    newClips.splice(targetIdx, 0, moved);

    // Recalculate timeline starts sequentially
    let currStart = 0;
    newClips.forEach((c) => {
      c.timelineStart = currStart;
      c.timecode = formatSMPTETimecode(currStart, project.fps);
      currStart += c.duration;
    });

    onReorderClips(newClips);
    setDraggedClipId(null);
  };

  // Adaptive ruler step
  const rulerStepSec =
    pixelsPerSecond >= 180
      ? 0.5 // Sub-second (12 frames) for frame view
      : pixelsPerSecond >= 70
      ? 1 // 1 second
      : pixelsPerSecond >= 25
      ? 2 // 2 seconds
      : pixelsPerSecond >= 10
      ? 5 // 5 seconds
      : pixelsPerSecond >= 3
      ? 15 // 15 seconds
      : pixelsPerSecond >= 0.8
      ? 60 // 1 minute
      : 300; // 5 minutes

  const totalRulerTicks = Math.ceil((assembled + rulerStepSec) / rulerStepSec) + 1;

  return (
    <div className="flex flex-col bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl overflow-hidden select-none">
      {/* Hidden file input for direct video clip footage uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={handleFileUpload}
      />
      {/* Top Duration Management & Assembly Status Panel */}
      <div className="p-4 bg-zinc-900/90 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Duration Counters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
              <Film className="w-5 h-5" />
            </span>
            <div>
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                Target Film Duration
              </div>
              <div className="text-lg font-bold font-mono text-white">
                {formatSMPTETimecode(target, project.fps)}{' '}
                <span className="text-xs font-sans text-zinc-400 font-normal">
                  ({formatDurationNice(target)})
                </span>
              </div>
            </div>
          </div>

          <div className="h-8 w-px bg-zinc-800 hidden sm:block" />

          <div>
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Assembled Timeline
            </div>
            <div className="text-lg font-bold font-mono text-cyan-400">
              {formatSMPTETimecode(assembled, project.fps)}{' '}
              <span className="text-xs font-sans text-zinc-400 font-normal">
                ({formatDurationNice(assembled)})
              </span>
            </div>
          </div>

          <div className="h-8 w-px bg-zinc-800 hidden sm:block" />

          {/* Variance / Delta Indicator */}
          <div>
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Duration Delta
            </div>
            <div className="flex items-center space-x-1.5">
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                  isTargetMatched
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : delta > 0
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                }`}
              >
                {delta === 0 ? '±0.0s (Exact Match)' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}s`}
              </span>
              {isTargetMatched && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            </div>
          </div>
        </div>

        {/* Center: Generation & Clip Stats */}
        <div className="flex items-center space-x-3 text-xs bg-zinc-950 px-3.5 py-1.5 rounded-lg border border-zinc-800">
          <div className="flex items-center space-x-1.5 text-zinc-300">
            <span className="font-semibold">{totalClips}</span>{' '}
            <span className="text-zinc-500">Total Clips</span>
          </div>
          <span className="text-zinc-700">•</span>
          <div className="flex items-center space-x-1 text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{generatedClips} Ready</span>
          </div>
          {pendingClips > 0 && (
            <>
              <span className="text-zinc-700">•</span>
              <div className="flex items-center space-x-1 text-amber-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>{pendingClips} Pending</span>
              </div>
            </>
          )}
          {failedClips > 0 && (
            <>
              <span className="text-zinc-700">•</span>
              <div className="flex items-center space-x-1 text-rose-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>{failedClips} Failed</span>
              </div>
            </>
          )}
        </div>

        {/* Right: Auto-Balance Button & Zoom Slider Controls */}
        <div className="flex items-center space-x-3">
          {!isTargetMatched && (
            <button
              onClick={onAutoBalanceTimeline}
              title="Automatically adjust shot durations and sub-clips to match target duration precisely"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg transition active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Auto-Balance</span>
            </button>
          )}

          {/* Interactive Zoom Slider with Full View / Frame View Switching */}
          <div className="flex items-center space-x-2 bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800 shadow-inner">
            {/* Full View Preset Button */}
            <button
              type="button"
              onClick={handleSwitchToFullView}
              title="Full View: Fit entire project in viewport"
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-semibold transition ${
                isFullViewActive
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-xs'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-805'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Full View</span>
            </button>

            {/* Slider with ZoomOut and ZoomIn buttons */}
            <div className="flex items-center space-x-1.5 px-2 border-x border-zinc-800">
              <button
                type="button"
                onClick={() => setPixelsPerSecond((p) => Math.max(fullViewPps, p * 0.75))}
                disabled={isFullViewActive}
                className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400 transition"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <div className="flex flex-col items-center">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(ppsToPercent(pixelsPerSecond))}
                  onChange={handleZoomSliderChange}
                  className="w-20 sm:w-28 md:w-36 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  title={`Zoom scale: ${Math.round(ppsToPercent(pixelsPerSecond))}%`}
                />
                <div className="flex justify-between w-full text-[9px] font-mono text-zinc-500 mt-0.5 leading-none">
                  <span>Full</span>
                  <span className="text-cyan-400 font-medium">
                    {isFullViewActive
                      ? 'Entire Project'
                      : isFrameViewActive
                      ? 'Frame View'
                      : `${pixelsPerSecond.toFixed(1)} px/s`}
                  </span>
                  <span>Frame</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPixelsPerSecond((p) => Math.min(frameViewPps * 1.5, p * 1.35))}
                disabled={isFrameViewActive}
                className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400 transition"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Frame View Preset Button */}
            <button
              type="button"
              onClick={handleSwitchToFrameView}
              title="Frame View: Detailed frame-by-frame clip editing"
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-semibold transition ${
                isFrameViewActive
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-xs'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-805'
              }`}
            >
              <Film className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Frame View</span>
            </button>
          </div>
        </div>
      </div>

      {/* AI Director Recommendation Alert if timeline deviates from target duration */}
      {!isTargetMatched && (
        <div className="px-4 py-2.5 bg-indigo-950/40 border-b border-indigo-500/30 flex items-center justify-between text-xs text-indigo-200">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              <strong>AI Director Recommendation:</strong> Timeline is{' '}
              {Math.abs(delta).toFixed(1)}s {delta < 0 ? 'under' : 'over'} the{' '}
              {formatDurationNice(target)} target.
              {delta < 0
                ? ' Add establishing aerial shot or extend reaction shots without exceeding provider clip duration limits.'
                : ' Trim secondary cutaways or tighten shot pacing to hit exact festival/commercial run-time.'}
            </span>
          </div>
          <button
            onClick={onAutoBalanceTimeline}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 underline underline-offset-2 ml-4 shrink-0"
          >
            Apply Alignment
          </button>
        </div>
      )}

      {/* Main Multi-Track Timeline Canvas Area */}
      <div
        ref={timelineContainerRef}
        className="relative overflow-x-auto overflow-y-hidden bg-zinc-950 min-h-[300px] border-b border-zinc-800"
        onClick={handleTimelineScrub}
      >
        <div style={{ width: `${timelineContentWidth}px` }} className="relative">
          {/* Timeline Time Ruler */}
          <div className="sticky top-0 z-30 h-8 bg-zinc-900/95 border-b border-zinc-800 flex items-center pl-[180px]">
            {/* Background frame ticks when in detailed frame view */}
            {isFrameViewActive && (
              <div
                className="absolute inset-y-0 left-[180px] right-0 pointer-events-none opacity-20"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, rgba(255,255,255,0.7) 0px, rgba(255,255,255,0.7) 1px, transparent 1px, transparent ${
                    pixelsPerSecond / project.fps
                  }px)`,
                }}
              />
            )}

            {/* Generated Time Ruler Ticks */}
            {Array.from({ length: totalRulerTicks }).map((_, idx) => {
              const tickTime = idx * rulerStepSec;
              if (tickTime > assembled + rulerStepSec * 2) return null;
              const leftPx = trackHeaderWidth + tickTime * pixelsPerSecond;
              const isMajorTick = idx % (rulerStepSec < 1 ? 2 : 1) === 0;

              return (
                <div
                  key={idx}
                  className="absolute flex flex-col items-start"
                  style={{ left: `${leftPx}px` }}
                >
                  <div
                    className={`w-px ${
                      isMajorTick ? 'h-3 bg-zinc-400' : 'h-1.5 bg-zinc-600'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-mono -ml-2 select-none ${
                      isFrameViewActive
                        ? 'text-purple-300 font-semibold'
                        : isMajorTick
                        ? 'text-zinc-300'
                        : 'text-zinc-500'
                    }`}
                  >
                    {formatSMPTETimecode(tickTime, project.fps)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Red Playhead Line */}
          <div
            className="absolute top-0 bottom-0 z-40 pointer-events-none flex flex-col items-center"
            style={{ left: `${trackHeaderWidth + currentTime * pixelsPerSecond}px` }}
          >
            <div className="w-3.5 h-3.5 bg-red-500 rounded-b-sm shadow-md transform -translate-y-1 rotate-45" />
            <div className="w-0.5 flex-1 bg-red-500/90 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          </div>

          {/* TRACK 1: Scene Groups */}
          <div className="flex h-9 border-b border-zinc-800/80 bg-zinc-900/40">
            <div className="w-[180px] shrink-0 sticky left-0 z-20 bg-zinc-900 border-r border-zinc-800 px-3 flex items-center justify-between text-xs font-semibold text-zinc-300">
              <span className="flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-zinc-400" />
                <span>Scenes</span>
              </span>
              <span className="text-[10px] text-zinc-500">{project.scenes.length}</span>
            </div>
            <div className="relative flex-1 h-full">
              {project.scenes.map((scene) => {
                const firstClip = project.clips.find((c) => c.sceneId === scene.sceneId);
                const sceneStart = firstClip ? firstClip.timelineStart : 0;
                const widthPx = Math.max(30, scene.calculatedDuration * pixelsPerSecond);

                return (
                  <div
                    key={scene.sceneId}
                    style={{
                      left: `${sceneStart * pixelsPerSecond}px`,
                      width: `${widthPx}px`,
                    }}
                    className="absolute top-1 bottom-1 px-2 rounded bg-zinc-800/80 border border-zinc-700/60 flex items-center text-[11px] font-medium text-zinc-300 truncate"
                  >
                    <span className="text-cyan-400 font-bold mr-1.5">Sc {scene.sceneNumber}:</span>
                    <span className="truncate">{scene.heading.replace('INT. ', '').replace('EXT. ', '')}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TRACK 2: Video Track 1 (Primary Visual Clips) */}
          <div className="flex h-20 border-b border-zinc-800 bg-zinc-950">
            <div className="w-[180px] shrink-0 sticky left-0 z-20 bg-zinc-900 border-r border-zinc-800 px-3 flex items-center justify-between text-xs font-semibold text-cyan-400">
              <span className="flex items-center space-x-1.5">
                <Film className="w-3.5 h-3.5 text-cyan-400" />
                <span>Video Track 1</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">V1</span>
            </div>
            <div className="relative flex-1 h-full">
              {project.clips.map((clip) => {
                const widthPx = Math.max(28, clip.duration * pixelsPerSecond);
                const leftPx = clip.timelineStart * pixelsPerSecond;
                const isSelected = clip.clipId === selectedClipId;
                const parentShot = project.shots.find((s) => s.shotId === clip.shotId);
                const providerSpec = PROVIDER_SPECS[clip.provider] || PROVIDER_SPECS['gemini-omni'];
                const totalClipFrames = Math.round(clip.duration * project.fps);

                return (
                  <div
                    key={clip.clipId}
                    draggable
                    onDragStart={(e) => handleDragStart(e, clip.clipId)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, clip.clipId)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectClip(clip.clipId);
                    }}
                    style={{
                      left: `${leftPx}px`,
                      width: `${widthPx}px`,
                    }}
                    className={`group absolute top-1.5 bottom-1.5 rounded-lg border cursor-pointer transition-all overflow-hidden p-1.5 flex flex-col justify-between ${
                      isSelected
                        ? 'bg-cyan-950/80 border-cyan-400 ring-2 ring-cyan-500/50 shadow-lg'
                        : 'bg-zinc-900 hover:bg-zinc-850 border-zinc-700/80 hover:border-zinc-500'
                    }`}
                  >
                    {/* Sprocket perforations in Frame View */}
                    {isFrameViewActive && (
                      <div
                        className="absolute top-0 left-0 right-0 h-1.5 opacity-30 pointer-events-none"
                        style={{
                          backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1.2px)',
                          backgroundSize: '8px 5px',
                          backgroundRepeat: 'repeat-x',
                        }}
                      />
                    )}

                    {/* Frame divider lines when zoomed in */}
                    {isFrameViewActive && (
                      <div
                        className="absolute inset-0 pointer-events-none opacity-15"
                        style={{
                          backgroundImage: `repeating-linear-gradient(90deg, rgba(255,255,255,0.4) 0px, rgba(255,255,255,0.4) 1px, transparent 1px, transparent ${
                            pixelsPerSecond / project.fps
                          }px)`,
                        }}
                      />
                    )}

                    {/* Header info */}
                    <div className="flex items-center justify-between gap-1 z-10">
                      <div className="flex items-center space-x-1 truncate">
                        <span className="text-[10px] font-bold text-cyan-400 font-mono">
                          #{parentShot?.shotNumber || 1}
                        </span>
                        <span className="text-[10px] text-zinc-200 font-medium truncate">
                          {parentShot?.shotType}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        {isFrameViewActive && (
                          <span className="text-[8px] font-mono text-purple-300 bg-purple-950/80 border border-purple-500/30 px-1 rounded">
                            {totalClipFrames}f
                          </span>
                        )}
                        <span className="text-[9px] font-mono text-zinc-400 bg-black/50 px-1 rounded">
                          {clip.duration.toFixed(1)}s
                        </span>
                      </div>
                    </div>

                    {/* Visual miniature representation */}
                    <div className="flex-1 my-0.5 rounded bg-black/40 flex items-center justify-between px-1.5 text-[9px] text-zinc-400 z-10">
                      <span className="truncate">{parentShot?.cameraMovement}</span>
                      <span className={`px-1 py-0.2 rounded text-[8px] font-mono ${providerSpec.badgeColor}`}>
                        {clip.provider}
                      </span>
                    </div>

                    {/* Status & Sub-segment indicator */}
                    <div className="flex items-center justify-between text-[9px] text-zinc-400 z-10">
                      <span className="flex items-center space-x-1">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            clip.generationStatus === 'completed'
                              ? 'bg-emerald-400'
                              : clip.generationStatus === 'generating'
                              ? 'bg-amber-400 animate-pulse'
                              : 'bg-zinc-500'
                          }`}
                        />
                        <span className="capitalize">{clip.generationStatus}</span>
                      </span>
                      {clip.totalClipsInShot > 1 && (
                        <span className="text-purple-300 font-mono">
                          part {clip.clipIndexInShot}/{clip.totalClipsInShot}
                        </span>
                      )}
                    </div>

                    {/* Trim in/out handles */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-cyan-500/50 cursor-ew-resize" />
                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-cyan-500/50 cursor-ew-resize" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* TRACK 3: Audio Dialogue Track */}
          <div className="flex h-12 border-b border-zinc-800 bg-zinc-950">
            <div className="w-[180px] shrink-0 sticky left-0 z-20 bg-zinc-900 border-r border-zinc-800 px-3 flex items-center justify-between text-xs font-semibold text-amber-400">
              <span className="flex items-center space-x-1.5">
                <Mic className="w-3.5 h-3.5 text-amber-400" />
                <span>Dialogue (A1)</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">{project.dialogueTracks.length}</span>
            </div>
            <div className="relative flex-1 h-full">
              {project.dialogueTracks.map((dlg) => {
                const widthPx = Math.max(30, dlg.duration * pixelsPerSecond);
                const leftPx = dlg.startTime * pixelsPerSecond;

                return (
                  <div
                    key={dlg.id}
                    style={{
                      left: `${leftPx}px`,
                      width: `${widthPx}px`,
                    }}
                    className="absolute top-1 bottom-1 rounded bg-amber-950/60 border border-amber-600/50 px-2 flex items-center text-[10px] text-amber-200 truncate"
                  >
                    <span className="font-bold mr-1.5 text-amber-300">{dlg.character}:</span>
                    <span className="truncate italic">"{dlg.text}"</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TRACK 4: Audio Sound Effects (SFX) Track */}
          <div className="flex h-11 border-b border-zinc-800 bg-zinc-950">
            <div className="w-[180px] shrink-0 sticky left-0 z-20 bg-zinc-900 border-r border-zinc-800 px-3 flex items-center justify-between text-xs font-semibold text-emerald-400">
              <span className="flex items-center space-x-1.5">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>SFX Foley (A2)</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">{project.sfxTracks.length}</span>
            </div>
            <div className="relative flex-1 h-full">
              {project.sfxTracks.map((sfx) => {
                const widthPx = Math.max(30, sfx.duration * pixelsPerSecond);
                const leftPx = sfx.startTime * pixelsPerSecond;

                return (
                  <div
                    key={sfx.id}
                    style={{
                      left: `${leftPx}px`,
                      width: `${widthPx}px`,
                    }}
                    className="absolute top-1 bottom-1 rounded bg-emerald-950/60 border border-emerald-600/50 px-2 flex items-center text-[10px] text-emerald-200 truncate"
                  >
                    <span className="font-semibold">{sfx.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TRACK 5: Cinematic Music Score */}
          <div className="flex h-11 border-b border-zinc-800 bg-zinc-950">
            <div className="w-[180px] shrink-0 sticky left-0 z-20 bg-zinc-900 border-r border-zinc-800 px-3 flex items-center justify-between text-xs font-semibold text-purple-400">
              <span className="flex items-center space-x-1.5">
                <Music className="w-3.5 h-3.5 text-purple-400" />
                <span>Music Score (A3)</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">Stereo</span>
            </div>
            <div className="relative flex-1 h-full">
              {project.musicTracks.map((mus) => {
                const widthPx = Math.max(30, mus.duration * pixelsPerSecond);
                const leftPx = mus.startTime * pixelsPerSecond;

                return (
                  <div
                    key={mus.id}
                    style={{
                      left: `${leftPx}px`,
                      width: `${widthPx}px`,
                    }}
                    className="absolute top-1 bottom-1 rounded bg-purple-950/50 border border-purple-500/40 px-2 flex items-center justify-between text-[10px] text-purple-200"
                  >
                    <span className="font-semibold truncate">{mus.title}</span>
                    <span className="font-mono text-[9px] text-purple-400 ml-2">{mus.bpm} BPM</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Clip Inspector Drawer */}
      {selectedClip && selectedShot && (
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex flex-col md:flex-row items-start justify-between gap-6">
          {/* Left: Shot & Clip Details */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {selectedClip.clipId}
                </span>
                <span className="text-sm font-semibold text-white">
                  Scene {selectedScene?.sceneNumber || 1} • Shot {selectedShot.shotNumber}: {selectedShot.title}
                </span>
                {selectedClip.totalClipsInShot > 1 && (
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                    Segment {selectedClip.clipIndexInShot} / {selectedClip.totalClipsInShot}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onGenerateClip(selectedClip.clipId)}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Regenerate Clip</span>
                </button>
                <button
                  onClick={() => onRemoveClip(selectedClip.clipId)}
                  className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-rose-950/40 transition"
                  title="Remove Clip from Timeline"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Prompt */}
            <div className="text-xs">
              <span className="text-zinc-500 font-semibold block mb-1">Generative Video Prompt:</span>
              <p className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 text-zinc-300 leading-relaxed font-mono text-[11px]">
                {selectedClip.prompt}
              </p>
            </div>

            {/* Visual Continuity Tags */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-zinc-950 p-2 rounded border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Screen Direction</span>
                <span className="text-zinc-200 font-medium capitalize">
                  {selectedClip.visualContinuity.screenDirection.replace(/-/g, ' ')}
                </span>
              </div>
              <div className="bg-zinc-950 p-2 rounded border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Lighting Key</span>
                <span className="text-zinc-200 font-medium truncate block" title={selectedClip.visualContinuity.lightingKey}>
                  {selectedClip.visualContinuity.lightingKey}
                </span>
              </div>
              <div className="bg-zinc-950 p-2 rounded border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Camera Style</span>
                <span className="text-zinc-200 font-medium truncate block">
                  {selectedShot.cameraMovement} ({selectedShot.angle})
                </span>
              </div>
              <div className="bg-zinc-950 p-2 rounded border border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Time of Day</span>
                <span className="text-zinc-200 font-medium">
                  {selectedClip.visualContinuity.timeOfDay}
                </span>
              </div>
            </div>

            {/* Provider Generation Error Notice if failed */}
            {selectedClip.error && (
              <div className="bg-rose-950/40 border border-rose-600/40 p-2.5 rounded-lg text-xs space-y-1">
                <div className="flex items-center space-x-1.5 font-semibold text-rose-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>Provider Generation Notice</span>
                </div>
                <p className="text-[11px] text-rose-200/90 font-mono break-words leading-relaxed">
                  {selectedClip.error}
                </p>
              </div>
            )}

            {/* Real Footage & Acoustic Voice Production Controls */}
            <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-300 flex items-center space-x-1.5">
                  <Film className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Real Video Asset & Voice Track</span>
                </span>
                {/* Source status badge */}
                {selectedClip.videoUrl ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>
                      {selectedClip.videoUrl.startsWith('/uploads/')
                        ? 'User Uploaded Video (MP4)'
                        : selectedClip.videoUrl.startsWith('/assets/motion_plates/')
                        ? 'Cinema Motion Plate (1080p)'
                        : 'AI Video Master (1080p)'}
                    </span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-zinc-800 border border-zinc-700">
                    Procedural Canvas Motion
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium transition disabled:opacity-50"
                  title="Upload MP4 or WebM video file for this shot"
                >
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isUploading ? 'Uploading Video...' : 'Upload Clip Footage'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onGenerateClip(selectedClip.clipId)}
                  disabled={selectedClip.generationStatus === 'generating'}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-700/60 text-cyan-200 text-xs font-medium transition disabled:opacity-50"
                  title="Generate or regenerate video clip via AI video provider"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{selectedClip.generationStatus === 'generating' ? 'Generating Video...' : 'Generate AI Video Clip'}</span>
                </button>

                {selectedShot.dialogueSnippet && (
                  <button
                    type="button"
                    onClick={handleSynthesizeDialogue}
                    disabled={isSynthesizingDlg}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 border border-purple-700/60 text-purple-200 text-xs font-medium transition disabled:opacity-50"
                    title={`Synthesize spoken dialogue speech audio for ${selectedShot.dialogueSnippet.speaker}`}
                  >
                    <Mic className="w-3.5 h-3.5 text-purple-400" />
                    <span>{isSynthesizingDlg ? 'Synthesizing Audio...' : 'Synthesize Spoken Voice'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Clip Duration & Frame-Accurate Precision Trim */}
          <div className="w-full md:w-72 bg-zinc-950 p-3.5 rounded-lg border border-zinc-800 space-y-3 shrink-0 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 font-medium">AI Provider</span>
              <span
                className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${
                  PROVIDER_SPECS[selectedClip.provider].badgeColor
                }`}
              >
                {PROVIDER_SPECS[selectedClip.provider].name}
              </span>
            </div>

            <div className="text-[11px] text-zinc-500">
              Provider limit:{' '}
              <strong className="text-zinc-300">
                {PROVIDER_SPECS[selectedClip.provider].minClipDuration}s –{' '}
                {PROVIDER_SPECS[selectedClip.provider].maxClipDuration}s
              </strong>
            </div>

            {/* Standard Duration Slider */}
            <div>
              <div className="flex items-center justify-between text-zinc-400 mb-1">
                <span>Clip Duration</span>
                <span className="font-mono text-cyan-400 font-bold">
                  {selectedClip.duration.toFixed(2)}s
                </span>
              </div>
              <input
                type="range"
                min={PROVIDER_SPECS[selectedClip.provider].minClipDuration}
                max={PROVIDER_SPECS[selectedClip.provider].maxClipDuration}
                step={1 / project.fps}
                value={selectedClip.duration}
                onChange={(e) => {
                  const newDur = parseFloat(e.target.value);
                  const updated: VideoClip = {
                    ...selectedClip,
                    duration: newDur,
                    outPoint: newDur,
                  };
                  onUpdateClip(updated);
                }}
                className="w-full accent-cyan-500"
              />
            </div>

            {/* Frame-by-Frame Precision Nudge Section */}
            <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800/90 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-300 font-medium flex items-center space-x-1">
                  <Film className="w-3 h-3 text-purple-400" />
                  <span>Frame-Accurate Trim</span>
                </span>
                <span className="font-mono text-purple-300 font-bold">
                  {Math.round(selectedClip.duration * project.fps)} frames
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleNudgeClipFrames(selectedClip, -5)}
                  disabled={
                    selectedClip.duration - 5 / project.fps <
                    PROVIDER_SPECS[selectedClip.provider].minClipDuration
                  }
                  className="px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-[10px] font-mono text-zinc-300 transition"
                  title="Trim -5 Frames"
                >
                  -5 Fr
                </button>
                <button
                  type="button"
                  onClick={() => handleNudgeClipFrames(selectedClip, -1)}
                  disabled={
                    selectedClip.duration - 1 / project.fps <
                    PROVIDER_SPECS[selectedClip.provider].minClipDuration
                  }
                  className="px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-[10px] font-mono text-cyan-300 transition flex items-center justify-center space-x-0.5"
                  title="Trim -1 Frame"
                >
                  <ChevronLeft className="w-3 h-3" />
                  <span>-1 Fr</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNudgeClipFrames(selectedClip, 1)}
                  disabled={
                    selectedClip.duration + 1 / project.fps >
                    PROVIDER_SPECS[selectedClip.provider].maxClipDuration
                  }
                  className="px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-[10px] font-mono text-cyan-300 transition flex items-center justify-center space-x-0.5"
                  title="Extend +1 Frame"
                >
                  <span>+1 Fr</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNudgeClipFrames(selectedClip, 5)}
                  disabled={
                    selectedClip.duration + 5 / project.fps >
                    PROVIDER_SPECS[selectedClip.provider].maxClipDuration
                  }
                  className="px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-[10px] font-mono text-zinc-300 transition"
                  title="Extend +5 Frames"
                >
                  +5 Fr
                </button>
              </div>

              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-1 border-t border-zinc-800/60">
                <span>In: F{Math.round(selectedClip.timelineStart * project.fps)}</span>
                <span>Out: F{Math.round((selectedClip.timelineStart + selectedClip.duration) * project.fps)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800/80 text-[10px] text-zinc-500">
              Timeline Start:{' '}
              <span className="text-zinc-300 font-mono">
                {formatSMPTETimecode(selectedClip.timelineStart, project.fps)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
