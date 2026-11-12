import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize2, Grid, Sparkles, Layers, Blend, ArrowLeft, ArrowRight, Zap, Moon } from 'lucide-react';
import { FilmProject, VideoClip, Shot, TRANSITION_PRESETS, TransitionType } from '../types/film';
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
  const prevVideoRef = useRef<HTMLVideoElement | null>(null);
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
  const currentClipIndex = project.clips.findIndex(
    (c) => localTimeRef.current >= c.timelineStart && localTimeRef.current < c.timelineStart + c.duration
  );
  const resolvedClipIndex = currentClipIndex >= 0 ? currentClipIndex : Math.max(0, project.clips.length - 1);
  const currentClip: VideoClip | undefined = project.clips[resolvedClipIndex];
  const prevClipForElement: VideoClip | undefined = resolvedClipIndex > 0 ? project.clips[resolvedClipIndex - 1] : undefined;

  const currentShot: Shot | undefined = project.shots.find((s) => s.shotId === currentClip?.shotId);
  const currentScene = project.scenes.find((sc) => sc.sceneId === currentClip?.sceneId);

  const isRealVideo = Boolean(
    currentClip?.videoUrl &&
    !currentClip.videoUrl.startsWith('procedural://') &&
    currentClip.generationStatus === 'completed'
  );

  const isPrevRealVideo = Boolean(
    prevClipForElement?.videoUrl &&
    !prevClipForElement.videoUrl.startsWith('procedural://') &&
    prevClipForElement.generationStatus === 'completed'
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
    const syncThreshold = isPlaying ? 0.35 : 0.03;
    if (Math.abs(video.currentTime - clipElapsed) > syncThreshold && video.readyState >= 1) {
      video.currentTime = clipElapsed;
    }

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, isRealVideo, currentClip?.clipId, playbackSpeed, isMuted, currentTime]);

  // Synchronize outgoing HTML Video Element during active transitions
  useEffect(() => {
    const prevVid = prevVideoRef.current;
    if (!prevVid || !isPrevRealVideo || !prevClipForElement || !currentClip) return;

    prevVid.playbackRate = playbackSpeed;
    prevVid.muted = true;

    const transType = currentClip.transitionIn || 'cut';
    const transDuration = currentClip.transitionDuration ?? (TRANSITION_PRESETS[transType]?.defaultDuration ?? 0.8);
    const clipElapsed = Math.max(0, localTimeRef.current - currentClip.timelineStart);
    const inTransition = transType !== 'cut' && transDuration > 0 && clipElapsed < transDuration;

    if (inTransition) {
      const prevElapsed = Math.max(0, prevClipForElement.duration - (transDuration - clipElapsed));
      const syncThreshold = isPlaying ? 0.35 : 0.03;
      if (Math.abs(prevVid.currentTime - prevElapsed) > syncThreshold && prevVid.readyState >= 1) {
        prevVid.currentTime = prevElapsed;
      }
      if (isPlaying && prevVid.paused) {
        prevVid.play().catch(() => {});
      } else if (!isPlaying && !prevVid.paused) {
        prevVid.pause();
      }
    } else if (!prevVid.paused) {
      prevVid.pause();
    }
  }, [isPlaying, isPrevRealVideo, prevClipForElement?.clipId, currentClip?.clipId, playbackSpeed, currentTime]);

  // Active dialogue line
  const activeDialogue = project.dialogueTracks.find(
    (d) => localTimeRef.current >= d.startTime && localTimeRef.current <= d.startTime + d.duration
  );

  const activeMusic =
    [...project.musicTracks]
      .reverse()
      .find((m) => localTimeRef.current >= m.startTime && localTimeRef.current < m.startTime + m.duration) ||
    project.musicTracks[project.musicTracks.length - 1];

  // Synchronize Acoustic Music Audio
  useEffect(() => {
    const musicAudio = musicAudioRef.current;
    if (!musicAudio) return;

    const rawVol = activeMusic?.volume ?? 70;
    const normalizedTrackVol = rawVol <= 1 && rawVol > 0 ? rawVol : rawVol / 100;
    const musicLevel = isMuted
      ? 0
      : Math.max(0, Math.min(1, normalizedTrackVol * ((project.exportSettings?.audioMix?.musicLevel ?? 70) / 100)));
    musicAudio.volume = musicLevel;
    musicAudio.playbackRate = playbackSpeed;

    if (activeMusic?.audioUrl) {
      const musicElapsed = Math.max(0, localTimeRef.current - (activeMusic.startTime || 0));
      const targetMusicTime =
        Number.isFinite(musicAudio.duration) && musicAudio.duration > 0
          ? musicElapsed % musicAudio.duration
          : musicElapsed;
      if (Math.abs(musicAudio.currentTime - targetMusicTime) > 0.5 && musicAudio.readyState >= 1) {
        musicAudio.currentTime = targetMusicTime;
      }
      if (isPlaying) {
        if (musicAudio.paused) {
          musicAudio.play().catch(() => {});
        }
      } else {
        musicAudio.pause();
      }
    } else {
      musicAudio.pause();
    }
  }, [isPlaying, isMuted, playbackSpeed, activeMusic?.id, activeMusic?.audioUrl, activeMusic?.volume, activeMusic?.startTime, currentTime, project.exportSettings?.audioMix?.musicLevel]);

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

      // Helper to render visual scene content (real video frame or procedural artwork)
      const drawClipVisual = (
        clip: VideoClip | null | undefined,
        shot: Shot | null | undefined,
        scene: any,
        elapsed: number,
        videoEl: HTMLVideoElement | null
      ) => {
        if (!clip) return;
        const clipProg = Math.min(1, Math.max(0, elapsed / (clip.duration || 4)));
        const hasRealVideo = Boolean(
          clip.videoUrl &&
          !clip.videoUrl.startsWith('procedural://') &&
          clip.generationStatus === 'completed' &&
          videoEl &&
          videoEl.readyState >= 2
        );

        if (hasRealVideo && videoEl) {
          try {
            ctx.drawImage(videoEl, offsetX, offsetY, videoWidth, videoHeight);
            return;
          } catch {
            // Fallback to procedural artwork
          }
        }

        // Color palette background based on scene/mood
        const gradient = ctx.createLinearGradient(offsetX, offsetY, offsetX + videoWidth, offsetY + videoHeight);
        const isNight = scene?.timeOfDay === 'NIGHT';
        const isGolden = scene?.timeOfDay === 'GOLDEN HOUR';
        const isDawn = scene?.timeOfDay === 'DAWN';

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
        const camMotion = shot?.cameraMovement || 'Static';
        let zoom = 1.0;
        let panX = 0;
        let panY = 0;

        if (camMotion === 'Push In / Dolly') {
          zoom = 1.0 + clipProg * 0.15;
        } else if (camMotion === 'Pull Back') {
          zoom = 1.15 - clipProg * 0.15;
        } else if (camMotion === 'Pan Left') {
          panX = (clipProg - 0.5) * 80;
        } else if (camMotion === 'Pan Right') {
          panX = (0.5 - clipProg) * 80;
        } else if (camMotion === 'Orbital Crane') {
          zoom = 1.05 + Math.sin(clipProg * Math.PI) * 0.08;
          panX = Math.cos(clipProg * Math.PI) * 50;
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

        // Foreground character silhouette
        const isExtremeWide = shot?.shotType === 'Extreme Wide' || shot?.shotType === 'Wide Establishing';
        const isCloseUp = shot?.shotType === 'Close-Up' || shot?.shotType === 'Extreme Close-Up';

        if (isCloseUp) {
          const charX = offsetX + videoWidth * 0.5;
          const charY = offsetY + videoHeight * 0.85;

          ctx.fillStyle = '#080b12';
          ctx.beginPath();
          ctx.ellipse(charX, charY - 90, 70, 95, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = isGolden ? '#f59e0b' : '#38bdf8';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(charX, charY - 90, 72, -Math.PI * 0.8, -Math.PI * 0.2);
          ctx.stroke();

          const visorGrad = ctx.createLinearGradient(charX - 40, charY - 110, charX + 40, charY - 70);
          visorGrad.addColorStop(0, 'rgba(6, 182, 212, 0.7)');
          visorGrad.addColorStop(1, 'rgba(14, 165, 233, 0.1)');
          ctx.fillStyle = visorGrad;
          ctx.beginPath();
          if ((ctx as any).roundRect) {
            (ctx as any).roundRect(charX - 35, charY - 110, 70, 32, 10);
          } else {
            ctx.rect(charX - 35, charY - 110, 70, 32);
          }
          ctx.fill();
        } else if (!isExtremeWide) {
          const charX = offsetX + videoWidth * (clip?.visualContinuity?.screenDirection === 'right-to-left' ? 0.65 : 0.4);
          const charY = offsetY + videoHeight * 0.82;

          ctx.fillStyle = '#040608';
          ctx.beginPath();
          ctx.ellipse(charX, charY - 50, 22, 26, 0, 0, Math.PI * 2);
          ctx.rect(charX - 28, charY - 24, 56, 75);
          ctx.fill();

          ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(charX, charY - 50, 24, Math.PI * 0.8, Math.PI * 1.4);
          ctx.stroke();
        }

        // Volumetric atmospheric particles / film grain
        particleSeed = (particleSeed + 1) % 1000;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        for (let p = 0; p < 30; p++) {
          const px = offsetX + ((p * 97 + particleSeed * 0.8) % videoWidth);
          const py = offsetY + ((p * 53 + particleSeed * 0.4) % videoHeight);
          ctx.fillRect(px, py, 1.5, 1.5);
        }

        ctx.restore(); // restore camera transform
      };

      // Elapsed time within current clip
      const clipElapsed = currentClip ? Math.max(0, localTimeRef.current - currentClip.timelineStart) : 0;
      const currentClipIndex = project.clips.findIndex((c) => c.clipId === currentClip?.clipId);
      const prevClip = currentClipIndex > 0 ? project.clips[currentClipIndex - 1] : null;
      const prevShot = prevClip ? project.shots.find((s) => s.shotId === prevClip.shotId) : null;
      const prevScene = prevClip ? project.scenes.find((sc) => sc.sceneId === prevClip.sceneId) : null;

      const transType = currentClip?.transitionIn || 'cut';
      const transDuration = currentClip?.transitionDuration ?? (TRANSITION_PRESETS[transType]?.defaultDuration ?? 0.8);
      const isTransitionActive = Boolean(
        prevClip &&
        transType !== 'cut' &&
        transDuration > 0 &&
        clipElapsed < transDuration
      );

      if (isTransitionActive && prevClip) {
        const transProgress = Math.min(1, Math.max(0, clipElapsed / transDuration));
        const prevElapsed = Math.max(0, prevClip.duration - (transDuration - clipElapsed));
        const prevVideoEl = isPrevRealVideo ? prevVideoRef.current : null;

        if (transType === 'cross_dissolve') {
          // 1. Cross-Dissolve: Draw outgoing clip beneath, then blend incoming clip over it
          drawClipVisual(prevClip, prevShot, prevScene, prevElapsed, prevVideoEl);
          ctx.save();
          ctx.globalAlpha = transProgress;
          drawClipVisual(currentClip, currentShot, currentScene, clipElapsed, isRealVideo ? videoRef.current : null);
          ctx.restore();
        } else if (transType === 'wipe_left') {
          // 2. Wipe Left: Outgoing clip beneath; incoming clip wipes in from right
          drawClipVisual(prevClip, prevShot, prevScene, prevElapsed, prevVideoEl);
          const wipeX = offsetX + videoWidth * (1 - transProgress);
          ctx.save();
          ctx.beginPath();
          ctx.rect(wipeX, offsetY, offsetX + videoWidth - wipeX, videoHeight);
          ctx.clip();
          drawClipVisual(currentClip, currentShot, currentScene, clipElapsed, isRealVideo ? videoRef.current : null);
          ctx.restore();
          // Glowing optical wipe edge line
          ctx.save();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = '#0284c7';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(wipeX, offsetY);
          ctx.lineTo(wipeX, offsetY + videoHeight);
          ctx.stroke();
          ctx.restore();
        } else if (transType === 'wipe_right') {
          // 3. Wipe Right: Outgoing clip beneath; incoming clip wipes in from left
          drawClipVisual(prevClip, prevShot, prevScene, prevElapsed, prevVideoEl);
          const wipeX = offsetX + videoWidth * transProgress;
          ctx.save();
          ctx.beginPath();
          ctx.rect(offsetX, offsetY, wipeX - offsetX, videoHeight);
          ctx.clip();
          drawClipVisual(currentClip, currentShot, currentScene, clipElapsed, isRealVideo ? videoRef.current : null);
          ctx.restore();
          // Glowing optical wipe edge line
          ctx.save();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = '#0284c7';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(wipeX, offsetY);
          ctx.lineTo(wipeX, offsetY + videoHeight);
          ctx.stroke();
          ctx.restore();
        } else if (transType === 'fade_black') {
          // 4. Fade to Black: Dip to black then fade up
          if (transProgress < 0.5) {
            drawClipVisual(prevClip, prevShot, prevScene, prevElapsed, prevVideoEl);
            const blackAlpha = Math.min(1, Math.max(0, transProgress * 2));
            ctx.fillStyle = `rgba(0, 0, 0, ${blackAlpha})`;
            ctx.fillRect(offsetX, offsetY, videoWidth, videoHeight);
          } else {
            drawClipVisual(currentClip, currentShot, currentScene, clipElapsed, isRealVideo ? videoRef.current : null);
            const blackAlpha = Math.min(1, Math.max(0, (1 - transProgress) * 2));
            ctx.fillStyle = `rgba(0, 0, 0, ${blackAlpha})`;
            ctx.fillRect(offsetX, offsetY, videoWidth, videoHeight);
          }
        } else if (transType === 'whip_pan') {
          // 5. Whip Pan: High-speed camera swivel with motion blur
          const ease = transProgress < 0.5 ? 2 * transProgress * transProgress : 1 - Math.pow(-2 * transProgress + 2, 2) / 2;
          if (transProgress < 0.5) {
            const shiftX = -ease * videoWidth * 1.35;
            ctx.save();
            ctx.translate(shiftX, 0);
            drawClipVisual(prevClip, prevShot, prevScene, prevElapsed, prevVideoEl);
            ctx.restore();
          } else {
            const shiftX = (1 - ease) * videoWidth * 1.35;
            ctx.save();
            ctx.translate(shiftX, 0);
            drawClipVisual(currentClip, currentShot, currentScene, clipElapsed, isRealVideo ? videoRef.current : null);
            ctx.restore();
          }
          // Horizontal motion streaks
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = 1.5;
          for (let s = 0; s < 10; s++) {
            const streakY = offsetY + (videoHeight * ((s * 37) % 100)) / 100;
            const streakX = offsetX + ((s * 83 + transProgress * 1600) % videoWidth);
            const streakLen = 140 + ((s * 29) % 120);
            ctx.beginPath();
            ctx.moveTo(streakX, streakY);
            ctx.lineTo(streakX + streakLen, streakY);
            ctx.stroke();
          }
          ctx.restore();
        }
      } else {
        // Standard Cut or regular playback
        drawClipVisual(currentClip, currentShot, currentScene, clipElapsed, isRealVideo ? videoRef.current : null);
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

      {isPrevRealVideo && prevClipForElement?.videoUrl && (
        <video
          ref={prevVideoRef}
          src={prevClipForElement.videoUrl}
          crossOrigin="anonymous"
          playsInline
          muted
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

          {/* Active Transition Badge */}
          {currentClip?.transitionIn && currentClip.transitionIn !== 'cut' && (
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded bg-zinc-950 border border-cyan-800/50 text-[11px] text-cyan-300 font-mono">
              <Blend className="w-3 h-3 text-cyan-400" />
              <span>{TRANSITION_PRESETS[currentClip.transitionIn]?.name || currentClip.transitionIn}:</span>
              <span className="font-bold text-cyan-200">{(currentClip.transitionDuration ?? 0.8).toFixed(1)}s</span>
            </div>
          )}
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
