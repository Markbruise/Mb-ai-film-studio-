import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize2, Grid, Sparkles, Layers } from 'lucide-react';
import { FilmProject, VideoClip, Shot } from '../types/film';
import { formatSMPTETimecode } from '../utils/timecode';

export interface CinemaPlayerRef {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
}

interface CinemaPlayerProps {
  project: FilmProject;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  selectedClipId?: string;
  onSelectClip?: (clipId: string) => void;
}

export const CinemaPlayer = forwardRef<CinemaPlayerRef, CinemaPlayerProps>(({
  project,
  currentTime,
  onTimeUpdate,
  selectedClipId,
  onSelectClip,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showOverlays, setShowOverlays] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const localTimeRef = useRef<number>(currentTime);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);

  // Sync ref
  useEffect(() => {
    localTimeRef.current = currentTime;
  }, [currentTime]);

  useImperativeHandle(ref, () => ({
    seekTo: (sec: number) => {
      localTimeRef.current = Math.max(0, Math.min(project.actualAssembledDuration, sec));
      onTimeUpdate(localTimeRef.current);
    },
    play: () => setIsPlaying(true),
    pause: () => setIsPlaying(false),
    getCurrentTime: () => localTimeRef.current,
  }));

  // Find active clip at current time
  const currentClip: VideoClip | undefined = project.clips.find(
    (c) => localTimeRef.current >= c.timelineStart && localTimeRef.current < c.timelineStart + c.duration
  ) || project.clips[project.clips.length - 1];

  const currentShot: Shot | undefined = project.shots.find((s) => s.shotId === currentClip?.shotId);
  const currentScene = project.scenes.find((sc) => sc.sceneId === currentClip?.sceneId);

  const isRealVideo = Boolean(
    currentClip?.videoUrl &&
    !currentClip.videoUrl.startsWith('procedural://') &&
    currentClip.generationStatus === 'completed'
  );

  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const dialogueAudioRef = useRef<HTMLAudioElement | null>(null);

  // Synchronize HTML Video Element when real video is present
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isRealVideo || !currentClip) return;

    video.playbackRate = playbackSpeed;
    video.muted = isMuted;

    const clipElapsed = Math.max(0, localTimeRef.current - currentClip.timelineStart);
    if (Math.abs(video.currentTime - clipElapsed) > 0.35) {
      video.currentTime = clipElapsed;
    }

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, isRealVideo, currentClip?.clipId, playbackSpeed, isMuted]);

  // Active dialogue line
  const activeDialogue = project.dialogueTracks.find(
    (d) => localTimeRef.current >= d.startTime && localTimeRef.current <= d.startTime + d.duration
  );

  const activeMusic = project.musicTracks.find(
    (m) => localTimeRef.current >= m.startTime && localTimeRef.current < m.startTime + m.duration
  ) || project.musicTracks[0];

  // Synchronize Acoustic Music Audio
  useEffect(() => {
    const musicAudio = musicAudioRef.current;
    if (!musicAudio) return;

    const musicLevel = isMuted
      ? 0
      : Math.max(0, Math.min(1, ((activeMusic?.volume ?? 70) / 100) * ((project.exportSettings?.audioMix?.musicLevel ?? 70) / 100)));
    musicAudio.volume = musicLevel;
    musicAudio.playbackRate = playbackSpeed;

    if (activeMusic?.audioUrl && isPlaying) {
      if (musicAudio.paused) {
        musicAudio.play().catch(() => {});
      }
    } else {
      musicAudio.pause();
    }
  }, [isPlaying, isMuted, playbackSpeed, activeMusic?.audioUrl, project.exportSettings?.audioMix?.musicLevel]);

  // Synchronize Spoken Character Dialogue Audio
  useEffect(() => {
    const dlgAudio = dialogueAudioRef.current;
    if (!dlgAudio) return;

    if (activeDialogue?.audioUrl && isPlaying) {
      const dlgElapsed = Math.max(0, localTimeRef.current - activeDialogue.startTime);
      const dlgLevel = isMuted
        ? 0
        : Math.max(0, Math.min(1, ((activeDialogue.volume ?? 85) / 100) * ((project.exportSettings?.audioMix?.dialogueLevel ?? 90) / 100)));
      dlgAudio.volume = dlgLevel;
      dlgAudio.playbackRate = playbackSpeed;

      if (Math.abs(dlgAudio.currentTime - dlgElapsed) > 0.3) {
        dlgAudio.currentTime = dlgElapsed;
      }

      if (dlgAudio.paused) {
        dlgAudio.play().catch(() => {});
      }
    } else {
      dlgAudio.pause();
    }
  }, [isPlaying, isMuted, playbackSpeed, activeDialogue?.id, activeDialogue?.audioUrl, currentTime, project.exportSettings?.audioMix?.dialogueLevel]);

  // Main animation / render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particleSeed = 0;

    const renderFrame = (timestamp: number) => {
      if (lastTimestampRef.current !== null && isPlaying) {
        const deltaSec = ((timestamp - lastTimestampRef.current) / 1000) * playbackSpeed;
        localTimeRef.current += deltaSec;
        if (localTimeRef.current >= project.actualAssembledDuration) {
          localTimeRef.current = 0;
          setIsPlaying(false);
        }
        onTimeUpdate(localTimeRef.current);
      }
      lastTimestampRef.current = timestamp;

      // Draw canvas frame
      const width = canvas.width;
      const height = canvas.height;

      // Background clearing
      ctx.fillStyle = '#08090c';
      ctx.fillRect(0, 0, width, height);

      // Letterbox calculation based on project.aspectRatio
      let videoWidth = width;
      let videoHeight = height;
      let targetRatio = 16 / 9;

      if (project.aspectRatio === '2.39:1') targetRatio = 2.39;
      else if (project.aspectRatio === '9:16') targetRatio = 9 / 16;
      else if (project.aspectRatio === '4:3') targetRatio = 4 / 3;

      const currentRatio = width / height;
      if (currentRatio > targetRatio) {
        videoWidth = height * targetRatio;
      } else {
        videoHeight = width / targetRatio;
      }

      const offsetX = (width - videoWidth) / 2;
      const offsetY = (height - videoHeight) / 2;

      // Draw cinematic frame area
      ctx.save();
      ctx.beginPath();
      ctx.rect(offsetX, offsetY, videoWidth, videoHeight);
      ctx.clip();

      // Procedural Cinema Scene Rendering
      const clipElapsed = currentClip ? localTimeRef.current - currentClip.timelineStart : 0;
      const clipProgress = currentClip ? Math.min(1, Math.max(0, clipElapsed / currentClip.duration)) : 0;

      // Draw real video frame if available; otherwise draw procedural cinematic scene
      if (isRealVideo && videoRef.current && videoRef.current.readyState >= 2) {
        try {
          ctx.drawImage(videoRef.current, offsetX, offsetY, videoWidth, videoHeight);
        } catch {
          // Graceful fallback to procedural scene
        }
      } else {
        // Color palette background based on scene/mood
        const gradient = ctx.createLinearGradient(offsetX, offsetY, offsetX + videoWidth, offsetY + videoHeight);
        const isNight = currentScene?.timeOfDay === 'NIGHT';
        const isGolden = currentScene?.timeOfDay === 'GOLDEN HOUR';
        const isDawn = currentScene?.timeOfDay === 'DAWN';

        if (isNight) {
          gradient.addColorStop(0, '#040b17');
          gradient.addColorStop(0.5, '#09182d');
          gradient.addColorStop(1, '#02050b');
        } else if (isGolden) {
          gradient.addColorStop(0, '#381c05');
          gradient.addColorStop(0.5, '#78350f');
          gradient.addColorStop(1, '#1e1104');
        } else if (isDawn) {
          gradient.addColorStop(0, '#1a102f');
          gradient.addColorStop(0.6, '#31103f');
          gradient.addColorStop(1, '#0e0b1c');
        } else {
          gradient.addColorStop(0, '#0f172a');
          gradient.addColorStop(0.5, '#1e293b');
          gradient.addColorStop(1, '#0b0f19');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(offsetX, offsetY, videoWidth, videoHeight);

        // Camera motion simulation (Push In, Pan Left, Tilt, etc.)
        ctx.save();
        const camMotion = currentShot?.cameraMovement || 'Static';
        let zoom = 1.0;
        let panX = 0;
        let panY = 0;

        if (camMotion === 'Push In / Dolly') {
          zoom = 1.0 + clipProgress * 0.15;
        } else if (camMotion === 'Pull Back') {
          zoom = 1.15 - clipProgress * 0.15;
        } else if (camMotion === 'Pan Left') {
          panX = (clipProgress - 0.5) * 80;
        } else if (camMotion === 'Pan Right') {
          panX = (0.5 - clipProgress) * 80;
        } else if (camMotion === 'Orbital Crane') {
          zoom = 1.05 + Math.sin(clipProgress * Math.PI) * 0.08;
          panX = Math.cos(clipProgress * Math.PI) * 50;
        }

        ctx.translate(offsetX + videoWidth / 2 + panX, offsetY + videoHeight / 2 + panY);
        ctx.scale(zoom, zoom);
        ctx.translate(-(offsetX + videoWidth / 2), -(offsetY + videoHeight / 2));

        // Draw Atmospheric Horizon / Structures
        ctx.strokeStyle = isNight ? 'rgba(56, 189, 248, 0.35)' : 'rgba(251, 146, 60, 0.4)';
        ctx.lineWidth = 1.5;

        // Horizon line
        const horizonY = offsetY + videoHeight * 0.58;
        ctx.beginPath();
        ctx.moveTo(offsetX, horizonY);
        ctx.lineTo(offsetX + videoWidth, horizonY);
        ctx.stroke();

        // Atmospheric Glow / Sun / Nebula
        const sunGrad = ctx.createRadialGradient(
          offsetX + videoWidth * 0.65,
          horizonY - 40,
          10,
          offsetX + videoWidth * 0.65,
          horizonY - 40,
          videoHeight * 0.6
        );
        sunGrad.addColorStop(0, isGolden ? 'rgba(253, 224, 71, 0.7)' : 'rgba(56, 189, 248, 0.5)');
        sunGrad.addColorStop(0.3, isGolden ? 'rgba(249, 115, 22, 0.25)' : 'rgba(99, 102, 241, 0.2)');
        sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = sunGrad;
        ctx.fillRect(offsetX, offsetY, videoWidth, videoHeight);

        // Architectural silhouettes / mountains / platform structures
        ctx.fillStyle = '#05070a';
        ctx.beginPath();
        ctx.moveTo(offsetX, horizonY);
        ctx.lineTo(offsetX + videoWidth * 0.15, horizonY - 70);
        ctx.lineTo(offsetX + videoWidth * 0.28, horizonY - 40);
        ctx.lineTo(offsetX + videoWidth * 0.45, horizonY - 110);
        ctx.lineTo(offsetX + videoWidth * 0.6, horizonY - 30);
        ctx.lineTo(offsetX + videoWidth * 0.82, horizonY - 85);
        ctx.lineTo(offsetX + videoWidth, horizonY);
        ctx.lineTo(offsetX + videoWidth, offsetY + videoHeight);
        ctx.lineTo(offsetX, offsetY + videoHeight);
        ctx.closePath();
        ctx.fill();

        // Futuristic Sci-Fi Gantry / Foreground Character Silhouette
        const isExtremeWide = currentShot?.shotType === 'Extreme Wide' || currentShot?.shotType === 'Wide Establishing';
        const isCloseUp = currentShot?.shotType === 'Close-Up' || currentShot?.shotType === 'Extreme Close-Up';

        if (isCloseUp) {
          // Dramatic character close-up silhouette with rim light
          const charX = offsetX + videoWidth * 0.5;
          const charY = offsetY + videoHeight * 0.85;

          // Head and shoulders
          ctx.fillStyle = '#080b12';
          ctx.beginPath();
          ctx.ellipse(charX, charY - 90, 70, 95, 0, 0, Math.PI * 2);
          ctx.fill();

          // Rim light on helmet/jawline
          ctx.strokeStyle = isGolden ? '#f59e0b' : '#38bdf8';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(charX, charY - 90, 72, -Math.PI * 0.8, -Math.PI * 0.2);
          ctx.stroke();

          // Visor glow
          const visorGrad = ctx.createLinearGradient(charX - 40, charY - 110, charX + 40, charY - 70);
          visorGrad.addColorStop(0, 'rgba(6, 182, 212, 0.7)');
          visorGrad.addColorStop(1, 'rgba(14, 165, 233, 0.1)');
          ctx.fillStyle = visorGrad;
          ctx.beginPath();
          if ((ctx as any).roundRect) { (ctx as any).roundRect(charX - 35, charY - 110, 70, 32, 10); } else { ctx.rect(charX - 35, charY - 110, 70, 32); }
          ctx.fill();
        } else if (!isExtremeWide) {
          // Medium shot character silhouette
          const charX = offsetX + videoWidth * (currentClip?.visualContinuity.screenDirection === 'right-to-left' ? 0.65 : 0.4);
          const charY = offsetY + videoHeight * 0.82;

          ctx.fillStyle = '#040608';
          ctx.beginPath();
          ctx.ellipse(charX, charY - 50, 22, 26, 0, 0, Math.PI * 2); // head
          ctx.rect(charX - 28, charY - 24, 56, 75); // torso
          ctx.fill();

          // Rim light contour
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(charX, charY - 50, 24, Math.PI * 0.8, Math.PI * 1.4);
          ctx.stroke();
        }

        // Volumetric atmospheric particles / film grain
        particleSeed = (particleSeed + 1) % 1000;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        for (let p = 0; p < 35; p++) {
          const px = offsetX + ((p * 97 + particleSeed * 0.8) % videoWidth);
          const py = offsetY + ((p * 53 + particleSeed * 0.4) % videoHeight);
          ctx.fillRect(px, py, 1.5, 1.5);
        }

        ctx.restore(); // restore camera transform
      }

      // Transition effects (Fade from Black / Dissolve)
      if (currentClip?.transitionIn === 'fade_black' && clipElapsed < (currentClip.transitionDuration || 0.8)) {
        const fadeRatio = 1 - clipElapsed / (currentClip.transitionDuration || 0.8);
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, fadeRatio))})`;
        ctx.fillRect(offsetX, offsetY, videoWidth, videoHeight);
      }

      // Safe Areas & Rule of Thirds Grid
      if (showGrid) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1;
        // 1/3 lines
        ctx.beginPath();
        ctx.moveTo(offsetX + videoWidth / 3, offsetY);
        ctx.lineTo(offsetX + videoWidth / 3, offsetY + videoHeight);
        ctx.moveTo(offsetX + (videoWidth * 2) / 3, offsetY);
        ctx.lineTo(offsetX + (videoWidth * 2) / 3, offsetY + videoHeight);
        ctx.moveTo(offsetX, offsetY + videoHeight / 3);
        ctx.lineTo(offsetX + videoWidth, offsetY + videoHeight / 3);
        ctx.moveTo(offsetX, offsetY + (videoHeight * 2) / 3);
        ctx.lineTo(offsetX + videoWidth, offsetY + (videoHeight * 2) / 3);
        ctx.stroke();

        // Center crosshair
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        const cx = offsetX + videoWidth / 2;
        const cy = offsetY + videoHeight / 2;
        ctx.beginPath();
        ctx.moveTo(cx - 15, cy);
        ctx.lineTo(cx + 15, cy);
        ctx.moveTo(cx, cy - 15);
        ctx.lineTo(cx, cy + 15);
        ctx.stroke();
      }

      ctx.restore(); // restore clipping

      // Draw Burned-in Subtitles
      if (activeDialogue && project.exportSettings.burnSubtitles) {
        ctx.save();
        ctx.font = '600 20px "Inter", sans-serif';
        ctx.textAlign = 'center';
        const subY = offsetY + videoHeight - 35;
        const subText = `${activeDialogue.character.toUpperCase()}: "${activeDialogue.text}"`;

        // Text background pill
        const textMetrics = ctx.measureText(subText);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.roundRect(width / 2 - textMetrics.width / 2 - 16, subY - 22, textMetrics.width + 32, 32, 6);
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.fillText(subText, width / 2, subY);
        ctx.restore();
      }

      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(renderFrame);
      }
    };

    lastTimestampRef.current = performance.now();
    renderFrame(performance.now());

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, playbackSpeed, currentClip, project, showGrid, showOverlays, activeDialogue]);

  // Keyboard shortcut listener (Spacebar for Play/Pause, arrows for step)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        localTimeRef.current = Math.min(project.actualAssembledDuration, localTimeRef.current + (e.shiftKey ? 1 : 1 / 24));
        onTimeUpdate(localTimeRef.current);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        localTimeRef.current = Math.max(0, localTimeRef.current - (e.shiftKey ? 1 : 1 / 24));
        onTimeUpdate(localTimeRef.current);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project.actualAssembledDuration, onTimeUpdate]);

  const jumpToPreviousShot = () => {
    if (!currentClip) return;
    const prevClip = [...project.clips].reverse().find((c: VideoClip) => c.timelineStart < currentClip.timelineStart - 0.2);
    const target = prevClip ? prevClip.timelineStart : 0;
    localTimeRef.current = target;
    onTimeUpdate(target);
  };

  const jumpToNextShot = () => {
    if (!currentClip) return;
    const nextClip = project.clips.find((c) => c.timelineStart > currentClip.timelineStart + 0.1);
    const target = nextClip ? nextClip.timelineStart : project.actualAssembledDuration;
    localTimeRef.current = target;
    onTimeUpdate(target);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col bg-zinc-950 rounded-xl border border-zinc-800/80 shadow-2xl overflow-hidden select-none"
    >
      {isRealVideo && currentClip?.videoUrl && (
        <video
          ref={videoRef}
          src={currentClip.videoUrl}
          crossOrigin="anonymous"
          playsInline
          muted={isMuted}
          className="hidden"
        />
      )}

      {/* Acoustic Soundtrack Audio */}
      {activeMusic?.audioUrl && (
        <audio
          ref={musicAudioRef}
          src={activeMusic.audioUrl}
          loop
          preload="auto"
          className="hidden"
        />
      )}

      {/* Spoken Dialogue Audio */}
      {activeDialogue?.audioUrl && (
        <audio
          ref={dialogueAudioRef}
          src={activeDialogue.audioUrl}
          preload="auto"
          className="hidden"
        />
      )}

      {/* Top Overlay Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
        <div className="flex items-center space-x-3">
          <span className={`flex items-center space-x-1.5 px-2 py-0.5 rounded text-xs font-semibold ${isRealVideo ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-600/20 text-red-400 border border-red-500/30'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isRealVideo ? 'bg-emerald-400' : 'bg-red-500 animate-pulse'}`} />
            <span>{isRealVideo ? '● AI Video Clip Ready' : '● Procedural Preview'}</span>
          </span>
          <span className="text-xs text-zinc-300 font-mono">
            {project.aspectRatio} | {project.fps} FPS | {project.exportSettings.resolution}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowGrid(!showGrid)}
            title="Toggle Rule-of-Thirds Grid"
            className={`p-1.5 rounded-md text-xs transition ${
              showGrid ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowOverlays(!showOverlays)}
            title="Toggle Info Overlays"
            className={`p-1.5 rounded-md text-xs transition ${
              showOverlays ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative w-full aspect-[16/9] max-h-[520px] bg-black flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full h-full object-contain cursor-pointer"
          onClick={() => setIsPlaying(!isPlaying)}
        />

        {/* Live Shot Metadata HUD */}
        {showOverlays && currentClip && (
          <div className="absolute top-12 left-4 pointer-events-none space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-black/70 backdrop-blur-md border border-zinc-700/60 text-xs">
              <span className="font-semibold text-cyan-400">Scene {currentScene?.sceneNumber || 1}</span>
              <span className="text-zinc-500">•</span>
              <span className="text-amber-400">Shot {currentShot?.shotNumber || 1}</span>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-300">{currentShot?.shotType}</span>
              <span className="text-zinc-500">•</span>
              <span className="text-emerald-400">{currentShot?.cameraMovement}</span>
            </div>
            {currentClip.totalClipsInShot > 1 && (
              <div className="inline-block px-2 py-0.5 rounded bg-purple-950/70 border border-purple-500/40 text-[10px] text-purple-300 font-mono">
                Provider Clip Segment {currentClip.clipIndexInShot} of {currentClip.totalClipsInShot} (Subdivided for {currentClip.provider})
              </div>
            )}
          </div>
        )}

        {/* Big Play Pause indicator when toggled */}
        {!isPlaying && (
          <div
            onClick={() => setIsPlaying(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/15 transition cursor-pointer"
          >
            <div className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl transform hover:scale-105 transition">
              <Play className="w-8 h-8 ml-1 fill-white" />
            </div>
          </div>
        )}
      </div>

      {/* Cinema Transport & Scrubber Bar */}
      <div className="px-4 py-3 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-300">
        {/* Playback Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={jumpToPreviousShot}
            title="Previous Shot"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-md transition"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 ml-0.5 fill-white" />}
          </button>

          <button
            onClick={jumpToNextShot}
            title="Next Shot"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Timecode Readout */}
          <div className="ml-3 flex items-center space-x-2 font-mono bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
            <span className="text-cyan-400 font-bold tracking-wider">
              {formatSMPTETimecode(currentTime, project.fps)}
            </span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">
              {formatSMPTETimecode(project.actualAssembledDuration, project.fps)}
            </span>
          </div>
        </div>

        {/* Speed & Audio controls */}
        <div className="flex items-center space-x-3">
          {/* Speed Selector */}
          <div className="flex items-center rounded-lg bg-zinc-950 p-0.5 border border-zinc-800 text-[11px]">
            {[0.5, 1, 2].map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-2 py-1 rounded font-medium transition ${
                  playbackSpeed === spd ? 'bg-zinc-800 text-white shadow-xs' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? 'Unmute' : 'Mute'}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});
