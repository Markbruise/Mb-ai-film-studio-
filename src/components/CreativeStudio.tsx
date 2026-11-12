/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  FilmProject,
  MusicTrackItem,
  Shot,
  VideoClip,
} from '../types/film';
import { formatDurationNice, formatSMPTETimecode } from '../utils/timecode';
import {
  Sparkles,
  Music,
  Video,
  Image as ImageIcon,
  Play,
  Pause,
  Upload,
  Plus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Wand2,
  Download,
  Film,
  Disc,
  ArrowRight,
  Volume2,
  Pencil,
} from 'lucide-react';

interface CreativeStudioProps {
  project: FilmProject;
  onUpdateProject: React.Dispatch<React.SetStateAction<FilmProject>>;
  selectedClipId: string | null;
  onNavigateToTimeline: () => void;
  initialSubTab?: 'music' | 'animate' | 'concept';
}

interface GeneratedMusicItem {
  id: string;
  title: string;
  audioUrl: string;
  duration: number;
  model: string;
  prompt: string;
  bpm: number;
  lyrics?: string;
  createdAt: number;
}

interface GeneratedVideoItem {
  id: string;
  videoUrl: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  createdAt: number;
  sourceImageThumbnail?: string;
}

interface GeneratedImageItem {
  id: string;
  imageUrl: string;
  base64Data?: string;
  prompt: string;
  aspectRatio: string;
  createdAt: number;
}

export function CreativeStudio({
  project,
  onUpdateProject,
  selectedClipId,
  onNavigateToTimeline,
  initialSubTab,
}: CreativeStudioProps) {
  const [subTab, setSubTab] = useState<'music' | 'animate' | 'concept'>(initialSubTab || 'music');

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // ==========================================
  // TAB 1: MUSIC GENERATION (Lyria 3) STATE
  // ==========================================
  const [musicModel, setMusicModel] = useState<'lyria-3-clip-preview' | 'lyria-3-pro-preview'>('lyria-3-clip-preview');
  const [musicPrompt, setMusicPrompt] = useState<string>('Cinematic orchestral sci-fi score with sweeping emotional strings, deep atmospheric synth drones, and heroic French horns building into a climactic crescendo');
  const [musicTitle, setMusicTitle] = useState<string>('Kepler Horizon');
  const [musicRefImage, setMusicRefImage] = useState<string | null>(null);
  const [isGeneratingMusic, setIsGeneratingMusic] = useState<boolean>(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [musicSuccess, setMusicSuccess] = useState<string | null>(null);
  const [musicHistory, setMusicHistory] = useState<GeneratedMusicItem[]>([]);
  const [activeMusicTrack, setActiveMusicTrack] = useState<GeneratedMusicItem | null>(null);
  const [isPlayingMusic, setIsPlayingMusic] = useState<boolean>(false);
  const [musicCurrentTime, setMusicCurrentTime] = useState<number>(0);
  const [musicAudioDuration, setMusicAudioDuration] = useState<number>(0);
  const [musicMonitorVolume, setMusicMonitorVolume] = useState<number>(0.85);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  // ==========================================
  // TAB 2: PHOTO-TO-VIDEO ANIMATOR (Gemini Omni Flash) STATE
  // ==========================================
  const [animImageData, setAnimImageData] = useState<string | null>(null);
  const [animPrompt, setAnimPrompt] = useState<string>('Smooth cinematic camera push-in, lifelike facial expression shifts, hair blowing gently in wind, realistic golden hour sunlight flares');
  const [animDuration, setAnimDuration] = useState<number>(5);
  const [animAspectRatio, setAnimAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [isAnimatingImage, setIsAnimatingImage] = useState<boolean>(false);
  const [animError, setAnimError] = useState<string | null>(null);
  const [animSuccess, setAnimSuccess] = useState<string | null>(null);
  const [animHistory, setAnimHistory] = useState<GeneratedVideoItem[]>([]);
  const [activeVideoItem, setActiveVideoItem] = useState<GeneratedVideoItem | null>(null);

  // ==========================================
  // TAB 3: CONCEPT ART & STORYBOARD (Gemini Nano Banana 2.1) STATE
  // ==========================================
  const [conceptPrompt, setConceptPrompt] = useState<string>('Cinematic 35mm film still of a weathered female astronaut gazing into an alien twilight sky with twin blue moons, atmospheric dust motes, anamorphic lens bokeh, Kodachrome color science');
  const [conceptAspect, setConceptAspect] = useState<'16:9' | '2.39:1' | '1:1' | '9:16'>('16:9');
  const [conceptBaseImage, setConceptBaseImage] = useState<string | null>(null);
  const [isGeneratingConcept, setIsGeneratingConcept] = useState<boolean>(false);
  const [conceptError, setConceptError] = useState<string | null>(null);
  const [conceptSuccess, setConceptSuccess] = useState<string | null>(null);
  const [conceptHistory, setConceptHistory] = useState<GeneratedImageItem[]>([]);
  const [activeConceptImage, setActiveConceptImage] = useState<GeneratedImageItem | null>(null);

  // File Input References
  const musicImageInputRef = useRef<HTMLInputElement | null>(null);
  const animImageInputRef = useRef<HTMLInputElement | null>(null);
  const conceptImageInputRef = useRef<HTMLInputElement | null>(null);

  // ==========================================
  // HANDLERS: MUSIC GENERATION
  // ==========================================
  const handleGenerateMusic = async () => {
    if (!musicPrompt.trim()) return;
    setIsGeneratingMusic(true);
    setMusicError(null);
    setMusicSuccess(null);

    try {
      const res = await fetch('/api/generate/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: musicPrompt,
          model: musicModel,
          title: musicTitle || 'Score Theme',
          referenceImage: musicRefImage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate music score');
      }

      const newItem: GeneratedMusicItem = {
        id: `lyria_${Date.now()}`,
        title: data.title || musicTitle,
        audioUrl: data.audioUrl,
        duration: data.duration || (musicModel === 'lyria-3-pro-preview' ? 120 : 30),
        model: data.model,
        prompt: musicPrompt,
        bpm: data.bpm || 110,
        lyrics: data.lyrics,
        createdAt: Date.now(),
      };

      setMusicHistory((prev) => [newItem, ...prev]);
      setActiveMusicTrack(newItem);
      setMusicSuccess(`Successfully synthesized ${data.duration}s score with ${data.model}!`);

      if (musicAudioRef.current) {
        musicAudioRef.current.src = newItem.audioUrl;
        musicAudioRef.current.play().catch(() => {});
        setIsPlayingMusic(true);
      }
    } catch (err: any) {
      console.error('Music generation error:', err);
      setMusicError(err.message || 'Generation failed');
    } finally {
      setIsGeneratingMusic(false);
    }
  };

  const handleAddMusicToTimeline = (item: GeneratedMusicItem, mode: 'replace' | 'append' = 'replace') => {
    onUpdateProject((prev) => {
      const startTime =
        mode === 'append'
          ? prev.musicTracks.reduce((max, t) => Math.max(max, t.startTime + t.duration), 0)
          : 0;

      const newTrack: MusicTrackItem = {
        id: `score_${Date.now()}`,
        title: item.title,
        mood: item.model === 'lyria-3-pro-preview' ? 'Full Orchestral Theme' : 'Score Leitmotif',
        bpm: item.bpm,
        startTime,
        duration: item.duration,
        volume: 85,
        audioUrl: item.audioUrl,
      };

      const nextTracks = mode === 'replace' ? [newTrack] : [...prev.musicTracks, newTrack];
      return {
        ...prev,
        musicTracks: nextTracks,
      };
    });

    setMusicSuccess(
      mode === 'replace'
        ? `Replaced film score on Timeline Track A3 with "${item.title}" (${item.duration}s)!`
        : `Appended "${item.title}" (${item.duration}s) to Timeline Track A3!`
    );
  };

  const toggleMusicPlayback = (item: GeneratedMusicItem) => {
    if (!musicAudioRef.current) return;

    if (activeMusicTrack?.id === item.id && isPlayingMusic) {
      musicAudioRef.current.pause();
      setIsPlayingMusic(false);
    } else {
      if (activeMusicTrack?.id !== item.id) {
        musicAudioRef.current.src = item.audioUrl;
        setMusicCurrentTime(0);
      }
      musicAudioRef.current.volume = musicMonitorVolume;
      setActiveMusicTrack(item);
      musicAudioRef.current.play().then(() => setIsPlayingMusic(true)).catch(() => {});
    }
  };

  // ==========================================
  // HANDLERS: PHOTO-TO-VIDEO ANIMATOR
  // ==========================================
  const handleImageUploadForAnim = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setAnimImageData(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAnimateImage = async () => {
    if (!animImageData) {
      setAnimError('Please upload a source image or select one from Concept Art.');
      return;
    }

    setIsAnimatingImage(true);
    setAnimError(null);
    setAnimSuccess(null);

    try {
      const res = await fetch('/api/generate/animate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: animImageData,
          prompt: animPrompt,
          duration: animDuration,
          aspectRatio: animAspectRatio,
          clipId: selectedClipId || `anim_${Date.now()}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to animate image with Gemini Omni Flash');
      }

      const newVideo: GeneratedVideoItem = {
        id: `anim_${Date.now()}`,
        videoUrl: data.videoUrl,
        prompt: data.prompt,
        duration: data.duration,
        aspectRatio: data.aspectRatio,
        createdAt: Date.now(),
        sourceImageThumbnail: animImageData,
      };

      setAnimHistory((prev) => [newVideo, ...prev]);
      setActiveVideoItem(newVideo);
      setAnimSuccess(`Successfully animated photo into ${data.duration}s video with Gemini Omni Flash!`);
    } catch (err: any) {
      console.error('Animate image error:', err);
      setAnimError(err.message || 'Animation failed');
    } finally {
      setIsAnimatingImage(false);
    }
  };

  const handleInsertVideoAsClip = (video: GeneratedVideoItem) => {
    onUpdateProject((prev) => {
      const lastClip = prev.clips[prev.clips.length - 1];
      const startSec = lastClip ? lastClip.timelineStart + lastClip.duration : 0;
      const lastScene = prev.scenes[prev.scenes.length - 1];
      const targetSceneId = lastScene?.sceneId || 'scene_1';
      const nextShotNum = prev.shots.reduce((max, s) => Math.max(max, s.shotNumber), 0) + 1;
      const newShotId = `shot_anim_${Date.now()}`;
      const newClipId = `clip_${Date.now()}`;

      const newShot: Shot = {
        shotId: newShotId,
        sceneId: targetSceneId,
        actId: lastScene?.actId || prev.acts[0]?.actId || 'act_1',
        shotNumber: nextShotNum,
        title: 'Omni Animated Keyframe',
        shotType: 'Medium Shot',
        cameraMovement: 'Push In / Dolly',
        angle: 'Eye Level',
        description: video.prompt,
        characters: [],
        targetDuration: video.duration,
        provider: 'gemini-omni',
        model: 'gemini-omni-1.2-flash',
        visualContinuity: {
          screenDirection: 'left-to-right',
          lightingKey: 'Cinematic High Key',
          colorPalette: 'Warm Golden Hour',
          cameraStyle: 'Omni Camera Push',
          timeOfDay: 'GOLDEN HOUR',
          location: lastScene?.location || 'Studio Animated Set',
          props: [],
        },
        clipIds: [newClipId],
      };

      const newClip: VideoClip = {
        clipId: newClipId,
        filmProjectId: prev.id,
        sceneId: targetSceneId,
        shotId: newShotId,
        clipIndexInShot: 1,
        totalClipsInShot: 1,
        prompt: video.prompt,
        duration: video.duration,
        provider: 'gemini-omni',
        model: 'gemini-omni-1.2-flash',
        generationStatus: 'completed',
        progress: 100,
        videoUrl: video.videoUrl,
        storageReference: video.videoUrl,
        timestamp: new Date().toISOString(),
        timecode: formatSMPTETimecode(startSec, prev.fps),
        characterReferences: [],
        visualContinuity: {
          screenDirection: 'left-to-right',
          lightingKey: 'Cinematic High Key',
          colorPalette: 'Warm Golden Hour',
          cameraStyle: 'Omni Camera Push',
          timeOfDay: 'GOLDEN HOUR',
          location: lastScene?.location || 'Studio Animated Set',
          props: [],
        },
        retryCount: 0,
        timelineTrackIndex: 0,
        timelineStart: startSec,
        inPoint: 0,
        outPoint: video.duration,
        transitionIn: 'cross_dissolve',
        transitionDuration: 0.8,
      };

      const updatedScenes = prev.scenes.map((sc) =>
        sc.sceneId === targetSceneId
          ? {
              ...sc,
              calculatedDuration: Math.round((sc.calculatedDuration + video.duration) * 10) / 10,
              shots: [...sc.shots, newShot],
            }
          : sc
      );

      return {
        ...prev,
        scenes: updatedScenes,
        shots: [...prev.shots, newShot],
        clips: [...prev.clips, newClip],
        actualAssembledDuration: Math.round((startSec + video.duration) * 10) / 10,
      };
    });

    setAnimSuccess(`Added animated clip to Timeline (Track V1)!`);
  };

  const handleReplaceSelectedClip = (video: GeneratedVideoItem) => {
    if (!selectedClipId) {
      handleInsertVideoAsClip(video);
      return;
    }

    onUpdateProject((prev) => {
      const updatedClips = prev.clips.map((c) => {
        if (c.clipId === selectedClipId) {
          return {
            ...c,
            videoUrl: video.videoUrl,
            storageReference: video.videoUrl,
            generationStatus: 'completed' as const,
            progress: 100,
            duration: video.duration,
            outPoint: video.duration,
          };
        }
        return c;
      });

      // Recalculate timeline positions
      let currentPos = 0;
      const reindexed = updatedClips.map((c) => {
        const item = { ...c, timelineStart: currentPos };
        currentPos += c.duration;
        return item;
      });

      return {
        ...prev,
        clips: reindexed,
        actualAssembledDuration: currentPos,
      };
    });

    setAnimSuccess(`Replaced clip ${selectedClipId} with animated video!`);
  };

  // ==========================================
  // HANDLERS: CONCEPT ART (Gemini Nano Banana 2.1)
  // ==========================================
  const handleGenerateConceptArt = async () => {
    if (!conceptPrompt.trim()) return;

    setIsGeneratingConcept(true);
    setConceptError(null);
    setConceptSuccess(null);

    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: conceptPrompt,
          aspectRatio: conceptAspect,
          imageSize: '1K',
          base64Image: conceptBaseImage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate image with Gemini Nano Banana 2.1');
      }

      const newImage: GeneratedImageItem = {
        id: `concept_${Date.now()}`,
        imageUrl: data.imageUrl,
        base64Data: data.base64Data,
        prompt: conceptPrompt,
        aspectRatio: conceptAspect,
        createdAt: Date.now(),
      };

      setConceptHistory((prev) => [newImage, ...prev]);
      setActiveConceptImage(newImage);
      setConceptSuccess(`Generated concept frame with gemini-nano-banana-2.1!`);
    } catch (err: any) {
      console.error('Concept generation error:', err);
      setConceptError(err.message || 'Image generation failed');
    } finally {
      setIsGeneratingConcept(false);
    }
  };

  const handleSendConceptToAnimator = (img: GeneratedImageItem) => {
    setAnimImageData(img.base64Data || img.imageUrl);
    setAnimPrompt(`Animate cinematic camera movement across this scene: ${img.prompt.slice(0, 100)}...`);
    setSubTab('animate');
    setAnimSuccess('Loaded concept image into Photo-to-Video Animator!');
  };

  const handleEditConceptImage = (img: GeneratedImageItem) => {
    setConceptBaseImage(img.base64Data || img.imageUrl);
    setConceptSuccess('Loaded concept frame into Base Image editor. Update your prompt on the left to modify this frame.');
  };

  return (
    <div className="space-y-6">
      {/* Hidden audio element for preview */}
      <audio
        ref={musicAudioRef}
        onTimeUpdate={() => {
          if (musicAudioRef.current) {
            setMusicCurrentTime(musicAudioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (musicAudioRef.current && Number.isFinite(musicAudioRef.current.duration)) {
            setMusicAudioDuration(musicAudioRef.current.duration);
          }
        }}
        onEnded={() => setIsPlayingMusic(false)}
        className="hidden"
      />

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-cyan-500/10 via-purple-500/5 to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 mb-1">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="font-bold tracking-wider uppercase">Generative Media Suite</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
              Director's Creative Studio
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Google GenAI Multi-Model
              </span>
            </h1>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              Synthesize full film scores with <strong className="text-zinc-200">Google Lyria 3</strong>, animate static frames with <strong className="text-zinc-200">Gemini Omni Flash</strong>, and design visual concept art with <strong className="text-zinc-200">Gemini Nano Banana 2.1</strong>.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onNavigateToTimeline}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-xs font-medium text-white border border-zinc-700 flex items-center space-x-2 transition"
            >
              <Film className="w-3.5 h-3.5 text-cyan-400" />
              <span>Back to Timeline</span>
            </button>
          </div>
        </div>

        {/* Feature Sub-Navigation Tabs */}
        <div className="flex items-center space-x-2 mt-6 pt-4 border-t border-zinc-800/80">
          <button
            onClick={() => setSubTab('music')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-medium transition ${
              subTab === 'music'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Music className="w-4 h-4 text-amber-400" />
            <span>AI Music Composer</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-500/10 text-amber-300">
              Lyria 3
            </span>
          </button>

          <button
            onClick={() => setSubTab('animate')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-medium transition ${
              subTab === 'animate'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Video className="w-4 h-4 text-cyan-400" />
            <span>Photo-to-Video Animator</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300">
              Omni Flash
            </span>
          </button>

          <button
            onClick={() => setSubTab('concept')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-medium transition ${
              subTab === 'concept'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-purple-400" />
            <span>Concept Art & Storyboard</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-purple-500/10 text-purple-300">
              Nano Banana 2.1
            </span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SUB-TAB 1: AI MUSIC COMPOSER (Google Lyria 3)            */}
      {/* ======================================================== */}
      {subTab === 'music' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Configuration Panel */}
          <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2">
                <Music className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold text-white">Score Synthesis Studio</h2>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                Official Google Lyria API
              </span>
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>Model Architecture</span>
                <span className="text-[11px] text-zinc-500">lyria-3-clip-preview vs pro</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMusicModel('lyria-3-clip-preview')}
                  className={`p-3 rounded-xl border text-left transition ${
                    musicModel === 'lyria-3-clip-preview'
                      ? 'bg-amber-500/10 border-amber-500/50 text-white'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="text-xs font-bold text-amber-300 font-mono">lyria-3-clip-preview</div>
                  <div className="text-[11px] text-zinc-400 mt-1 leading-tight">
                    Short clips & leitmotifs up to 30s. Rapid audio stream synthesis.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMusicModel('lyria-3-pro-preview')}
                  className={`p-3 rounded-xl border text-left transition ${
                    musicModel === 'lyria-3-pro-preview'
                      ? 'bg-amber-500/10 border-amber-500/50 text-white'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="text-xs font-bold text-amber-300 font-mono">lyria-3-pro-preview</div>
                  <div className="text-[11px] text-zinc-400 mt-1 leading-tight">
                    Full-length tracks up to 2 minutes with orchestrated structure.
                  </div>
                </button>
              </div>
            </div>

            {/* Cue Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Cue / Track Title</label>
              <input
                type="text"
                value={musicTitle}
                onChange={(e) => setMusicTitle(e.target.value)}
                placeholder="e.g. Kepler Dawn Theme"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Prompt Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>Music Score Description / Prompt</span>
                <span className="text-[11px] text-amber-400 font-mono">Orchestration & Tempo</span>
              </label>
              <textarea
                value={musicPrompt}
                onChange={(e) => setMusicPrompt(e.target.value)}
                rows={4}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 focus:outline-none focus:border-amber-500 leading-relaxed font-sans"
                placeholder="Describe instrumentation, emotional arc, tempo, and cinematic vibe..."
              />
            </div>

            {/* Prompt Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-zinc-400">Cinematic Presets:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Sci-Fi Synth Orchestral', prompt: 'Epic sci-fi score with pulsing modular synthesizers, sweeping cello section, atmospheric sub-bass, and emotional brass swell' },
                  { label: 'Tense Action Chase', prompt: 'High-octane action thriller cue with thunderous cinematic taiko drums, rapid ostinato violins, and dark driving bass at 135 BPM' },
                  { label: 'Noir Mystery Jazz', prompt: 'Moody neo-noir film cue featuring muted solo trumpet, slow walking upright bass, gentle rainy brush drums, and melancholic Rhodes chords' },
                  { label: 'Emotional Climax', prompt: 'Heartbreaking orchestral emotional peak with solo piano, warm string quintet crescendo, and ethereal angelic vocal choir' },
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setMusicPrompt(preset.prompt);
                      setMusicTitle(preset.label);
                    }}
                    className="px-2 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Reference Image Grounding */}
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>Visual Inspiration Image (Optional)</span>
                <span className="text-[11px] text-zinc-500">Condition music on moodboard</span>
              </label>

              {musicRefImage ? (
                <div className="relative rounded-xl overflow-hidden border border-zinc-700 h-28 bg-zinc-950 flex items-center justify-center">
                  <img src={musicRefImage} alt="Reference" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setMusicRefImage(null)}
                    className="absolute top-2 right-2 px-2 py-1 rounded bg-black/80 hover:bg-black text-[10px] text-red-400 font-mono"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => musicImageInputRef.current?.click()}
                  className="w-full py-4 rounded-xl border border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-950/50 flex flex-col items-center justify-center text-xs text-zinc-400 hover:text-zinc-200 transition"
                >
                  <Upload className="w-4 h-4 mb-1 text-zinc-500" />
                  <span>Upload moodboard frame or concept art</span>
                  <span className="text-[10px] text-zinc-600 mt-0.5">PNG, JPG up to 10MB</span>
                </button>
              )}
              <input
                ref={musicImageInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => setMusicRefImage(event.target?.result as string);
                  reader.readAsDataURL(file);
                }}
                className="hidden"
              />
            </div>

            {/* Error & Success Messages */}
            {musicError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{musicError}</div>
              </div>
            )}

            {musicSuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300 flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{musicSuccess}</div>
              </div>
            )}

            {/* Generate Action Button */}
            <button
              onClick={handleGenerateMusic}
              disabled={isGeneratingMusic || !musicPrompt.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs flex items-center justify-center space-x-2 transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              {isGeneratingMusic ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Orchestral Audio Stream with {musicModel}...</span>
                </>
              ) : (
                <>
                  <Disc className="w-4 h-4" />
                  <span>Synthesize Film Score with Google Lyria</span>
                </>
              )}
            </button>
          </div>

          {/* Right Preview & History Panel */}
          <div className="lg:col-span-6 space-y-5">
            {/* Active Track Player */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center space-x-2">
                  <Disc className="w-4 h-4 text-amber-400 animate-spin-slow" />
                  <h3 className="text-sm font-bold text-white">Audio Monitor & Playback</h3>
                </div>
                {activeMusicTrack && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/30">
                    {activeMusicTrack.duration}s • {activeMusicTrack.bpm} BPM
                  </span>
                )}
              </div>

              {activeMusicTrack ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => toggleMusicPlayback(activeMusicTrack)}
                          className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center transition shadow-md shrink-0"
                        >
                          {isPlayingMusic ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                        </button>
                        <div>
                          <div className="text-sm font-bold text-white">{activeMusicTrack.title}</div>
                          <div className="text-xs text-zinc-400 font-mono">
                            {activeMusicTrack.model} • {formatDurationNice(activeMusicTrack.duration)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleAddMusicToTimeline(activeMusicTrack, 'replace')}
                          className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center space-x-1.5 transition"
                          title="Replace existing score on Track A3"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Replace Score (A3)</span>
                        </button>
                        <button
                          onClick={() => handleAddMusicToTimeline(activeMusicTrack, 'append')}
                          className="px-2.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700 text-xs font-medium flex items-center space-x-1 transition"
                          title="Append after existing music cues on Track A3"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Append</span>
                        </button>
                      </div>
                    </div>

                    {/* Interactive Scrubber & Volume Bar */}
                    <div className="flex items-center gap-3 pt-2 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-400">
                      <span className="w-10 text-right">{Math.floor(musicCurrentTime)}s</span>
                      <input
                        type="range"
                        min={0}
                        max={musicAudioDuration || activeMusicTrack.duration || 30}
                        step={0.1}
                        value={musicCurrentTime}
                        onChange={(e) => {
                          const t = parseFloat(e.target.value);
                          setMusicCurrentTime(t);
                          if (musicAudioRef.current) musicAudioRef.current.currentTime = t;
                        }}
                        className="flex-1 accent-amber-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                      <span className="w-10">{Math.round(musicAudioDuration || activeMusicTrack.duration)}s</span>
                      <div className="flex items-center space-x-1.5 pl-2 border-l border-zinc-800">
                        <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={musicMonitorVolume}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setMusicMonitorVolume(v);
                            if (musicAudioRef.current) musicAudioRef.current.volume = v;
                          }}
                          className="w-16 accent-amber-400 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                          title={`Monitor volume: ${Math.round(musicMonitorVolume * 100)}%`}
                        />
                      </div>
                    </div>
                  </div>

                  {activeMusicTrack.lyrics && (
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-300 space-y-1">
                      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Lyrical Theme / Vocal Notes</div>
                      <div className="italic text-zinc-400 leading-relaxed">{activeMusicTrack.lyrics}</div>
                    </div>
                  )}

                  <div className="text-xs text-zinc-400 bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/60">
                    <span className="text-zinc-300 font-semibold">Prompt: </span>
                    {activeMusicTrack.prompt}
                  </div>
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-center text-zinc-500 space-y-2">
                  <Music className="w-10 h-10 text-zinc-700" />
                  <p className="text-xs">No track synthesized yet. Configure the orchestra on the left and synthesize your first score cue.</p>
                </div>
              )}
            </div>

            {/* Generated Tracks Reel */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
                Session Generated Cues ({musicHistory.length})
              </h3>

              {musicHistory.length === 0 ? (
                <p className="text-xs text-zinc-600 italic">No cues in session reel.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {musicHistory.map((item) => {
                    const ext = item.audioUrl.endsWith('.mp3') ? '.mp3' : '.wav';
                    return (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between hover:border-zinc-700 transition"
                      >
                        <div className="flex items-center space-x-3 truncate">
                          <button
                            onClick={() => toggleMusicPlayback(item)}
                            className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center shrink-0"
                          >
                            {activeMusicTrack?.id === item.id && isPlayingMusic ? (
                              <Pause className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5 ml-0.5" />
                            )}
                          </button>
                          <div className="truncate">
                            <div className="text-xs font-bold text-white truncate">{item.title}</div>
                            <div className="text-[10px] text-zinc-400 font-mono">
                              {item.duration}s • {item.model}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          <button
                            onClick={() => handleAddMusicToTimeline(item, 'replace')}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-medium transition flex items-center space-x-1"
                            title="Use as primary Film Score on Track A3"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Score (A3)</span>
                          </button>
                          <a
                            href={item.audioUrl}
                            download={`${item.title}${ext}`}
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
                            title={`Download ${ext.slice(1).toUpperCase()}`}
                          >
                            <Download className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 2: PHOTO-TO-VIDEO ANIMATOR (Gemini Omni Flash)   */}
      {/* ======================================================== */}
      {subTab === 'animate' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls */}
          <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2">
                <Video className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-white">Gemini Omni Flash Animator</h2>
              </div>
              <span className="text-[11px] font-mono text-cyan-400">
                Official Interactions API
              </span>
            </div>

            {/* Photo Upload / Selection */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>Input Photo or Keyframe</span>
                <span className="text-[11px] text-cyan-400 font-mono">Conditioning Frame</span>
              </label>

              {animImageData ? (
                <div className="relative rounded-xl overflow-hidden border border-zinc-700 bg-zinc-950 h-52 flex items-center justify-center">
                  <img src={animImageData} alt="Animation Source" className="h-full w-full object-contain" />
                  <button
                    type="button"
                    onClick={() => setAnimImageData(null)}
                    className="absolute top-2 right-2 px-2 py-1 rounded bg-black/80 hover:bg-black text-[10px] text-red-400 font-mono"
                  >
                    Change Image
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => animImageInputRef.current?.click()}
                  className="w-full py-12 rounded-xl border-2 border-dashed border-zinc-800 hover:border-cyan-500/50 bg-zinc-950/60 flex flex-col items-center justify-center text-xs text-zinc-400 hover:text-white transition group"
                >
                  <Upload className="w-6 h-6 mb-2 text-zinc-500 group-hover:text-cyan-400 transition" />
                  <span className="font-semibold text-zinc-300">Upload portrait, concept art, or film frame</span>
                  <span className="text-[11px] text-zinc-500 mt-1">Supports PNG, JPG, WebP up to 25MB</span>
                </button>
              )}
              <input
                ref={animImageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUploadForAnim}
                className="hidden"
              />
            </div>

            {/* Aspect Ratio & Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Aspect Ratio</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAnimAspectRatio('16:9')}
                    className={`py-2 rounded-xl border text-xs font-mono font-bold transition ${
                      animAspectRatio === '16:9'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    16:9 (Cinema)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnimAspectRatio('9:16')}
                    className={`py-2 rounded-xl border text-xs font-mono font-bold transition ${
                      animAspectRatio === '9:16'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    9:16 (Vertical)
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                  <span>Duration</span>
                  <span className="text-cyan-400 font-mono font-bold">{animDuration}s</span>
                </label>
                <input
                  type="range"
                  min={3}
                  max={15}
                  step={1}
                  value={animDuration}
                  onChange={(e) => setAnimDuration(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-400 mt-2"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                  <span>3s (Short beat)</span>
                  <span>15s (Full sequence)</span>
                </div>
              </div>
            </div>

            {/* Motion Prompt */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>Director Motion & Physics Instructions</span>
                <span className="text-[11px] text-cyan-400 font-mono">Camera & Atmosphere</span>
              </label>
              <textarea
                value={animPrompt}
                onChange={(e) => setAnimPrompt(e.target.value)}
                rows={3}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 leading-relaxed font-sans"
                placeholder="Describe how camera moves, character expressions, lighting changes..."
              />
            </div>

            {/* Motion Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-zinc-400">Motion Presets:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Subtle Facial Life & Blink', prompt: 'Subtle lifelike micro-expressions, slow breathing, natural eye blinks and gaze shift, ambient wind blowing hair' },
                  { label: 'Dramatic Dolly Push-In', prompt: 'Slow dramatic camera dolly push-in towards the subject, cinematic depth of field defocusing background, golden lens flare' },
                  { label: 'Atmospheric Weather Motion', prompt: 'Heavy atmospheric rain falling with water droplets running down surfaces, dramatic lightning flicker in background, smoke drifting' },
                  { label: 'Slow Orbital Pan', prompt: '360 degree slow orbital camera movement around the character, realistic dynamic parallax of foreground and background geometry' },
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAnimPrompt(preset.prompt)}
                    className="px-2 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Error & Success Messages */}
            {animError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{animError}</div>
              </div>
            )}

            {animSuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300 flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{animSuccess}</div>
              </div>
            )}

            {/* Animate Button */}
            <button
              onClick={handleAnimateImage}
              disabled={isAnimatingImage || !animImageData}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold text-xs flex items-center justify-center space-x-2 transition shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              {isAnimatingImage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>Generating Video with Gemini Omni Flash (Interactions API)...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  <span>Animate Photo into Video ({animDuration}s, {animAspectRatio})</span>
                </>
              )}
            </button>
          </div>

          {/* Right Video Preview & Timeline Bridge */}
          <div className="lg:col-span-6 space-y-5">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center space-x-2">
                  <Film className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Generated Video Output</h3>
                </div>
                {activeVideoItem && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                    {activeVideoItem.duration}s • {activeVideoItem.aspectRatio}
                  </span>
                )}
              </div>

              {activeVideoItem ? (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden bg-black border border-zinc-800 aspect-video flex items-center justify-center">
                    <video
                      src={activeVideoItem.videoUrl}
                      controls
                      autoPlay
                      loop
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-xs text-zinc-300">
                    <span className="font-semibold text-cyan-300">Prompt: </span>
                    {activeVideoItem.prompt}
                  </div>

                  {/* Timeline Actions */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => handleInsertVideoAsClip(activeVideoItem)}
                      className="py-2.5 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold flex items-center justify-center space-x-2 transition"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Insert as New Timeline Clip</span>
                    </button>

                    <button
                      onClick={() => handleReplaceSelectedClip(activeVideoItem)}
                      className="py-2.5 px-3 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-bold flex items-center justify-center space-x-2 transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{selectedClipId ? `Replace Clip ${selectedClipId}` : 'Add to End of Track'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-16 flex flex-col items-center justify-center text-center text-zinc-500 space-y-2">
                  <Video className="w-10 h-10 text-zinc-700" />
                  <p className="text-xs">No video generated yet. Upload an image and click Animate.</p>
                </div>
              )}
            </div>

            {/* Video History Reel */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
                Session Generated Videos ({animHistory.length})
              </h3>

              {animHistory.length === 0 ? (
                <p className="text-xs text-zinc-600 italic">No animated videos in session.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                  {animHistory.map((vid) => (
                    <div
                      key={vid.id}
                      onClick={() => setActiveVideoItem(vid)}
                      className="group cursor-pointer rounded-xl overflow-hidden border border-zinc-800 hover:border-cyan-500/50 bg-zinc-950 p-2 space-y-2 transition"
                    >
                      <div className="relative aspect-video rounded-lg overflow-hidden bg-black flex items-center justify-center">
                        <video src={vid.videoUrl} className="w-full h-full object-cover" muted />
                        <div className="absolute inset-0 bg-black/30 group-hover:bg-transparent flex items-center justify-center">
                          <Play className="w-5 h-5 text-white opacity-80" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                        <span>{vid.duration}s</span>
                        <span className="text-cyan-400">{vid.aspectRatio}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 3: CONCEPT ART & STORYBOARD (Gemini Nano Banana 2.1) */}
      {/* ======================================================== */}
      {subTab === 'concept' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Controls */}
          <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2">
                <ImageIcon className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-bold text-white">Visual Concept & Storyboard Studio</h2>
              </div>
              <span className="text-[11px] font-mono text-purple-400">
                gemini-nano-banana-2.1
              </span>
            </div>

            {/* Prompt */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>Concept / Shot Description Prompt</span>
                <span className="text-[11px] text-purple-400 font-mono">Cinematography & Style</span>
              </label>
              <textarea
                value={conceptPrompt}
                onChange={(e) => setConceptPrompt(e.target.value)}
                rows={4}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 focus:outline-none focus:border-purple-500 leading-relaxed font-sans"
                placeholder="Describe subject, camera lens, lighting, costume, background details..."
              />
            </div>

            {/* Aspect Ratio Options */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Aspect Ratio</label>
              <div className="grid grid-cols-4 gap-2">
                {(['16:9', '2.39:1', '1:1', '9:16'] as const).map((aspect) => (
                  <button
                    key={aspect}
                    type="button"
                    onClick={() => setConceptAspect(aspect)}
                    className={`py-2 rounded-xl border text-xs font-mono font-bold transition ${
                      conceptAspect === aspect
                        ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    {aspect}
                  </button>
                ))}
              </div>
            </div>

            {/* Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-zinc-400">Cinematic Presets:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '35mm Anamorphic Film Still', prompt: 'Cinematic 35mm film still of a futuristic cityscape bathed in golden sunset light, subtle anamorphic lens distortion, shallow depth of field, rich film grain' },
                  { label: 'Character Costume Sheet', prompt: 'Detailed cinematic character design sheet, full body portrait of an explorer in modular pressurized tactical suit, front lighting, neutral cinematic studio backdrop' },
                  { label: 'Alien Planet Establishing Shot', prompt: 'Epic establishing shot of alien crystalline canyon with dual suns, atmospheric dust motes, ultra-wide 18mm lens perspective, high dynamic range' },
                  { label: 'Noir Storyboard Keyframe', prompt: 'Dramatic chiaroscuro noir keyframe, detective standing under flickering neon street lamp in heavy rain, deep shadows, high-contrast black and cyan lighting' },
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setConceptPrompt(preset.prompt)}
                    className="px-2 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Image-to-Image editing */}
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>Base Image for Modification (Optional)</span>
                <span className="text-[11px] text-zinc-500">Image-to-image editing</span>
              </label>

              {conceptBaseImage ? (
                <div className="relative rounded-xl overflow-hidden border border-zinc-700 h-28 bg-zinc-950 flex items-center justify-center">
                  <img src={conceptBaseImage} alt="Base" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setConceptBaseImage(null)}
                    className="absolute top-2 right-2 px-2 py-1 rounded bg-black/80 hover:bg-black text-[10px] text-red-400 font-mono"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => conceptImageInputRef.current?.click()}
                  className="w-full py-4 rounded-xl border border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-950/50 flex flex-col items-center justify-center text-xs text-zinc-400 hover:text-zinc-200 transition"
                >
                  <Upload className="w-4 h-4 mb-1 text-zinc-500" />
                  <span>Upload base image to modify with prompt</span>
                </button>
              )}
              <input
                ref={conceptImageInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => setConceptBaseImage(event.target?.result as string);
                  reader.readAsDataURL(file);
                }}
                className="hidden"
              />
            </div>

            {/* Error & Success Messages */}
            {conceptError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{conceptError}</div>
              </div>
            )}

            {conceptSuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300 flex items-start space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{conceptSuccess}</div>
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerateConceptArt}
              disabled={isGeneratingConcept || !conceptPrompt.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-lg shadow-purple-500/20 disabled:opacity-50"
            >
              {isGeneratingConcept ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Generating Concept Frame with gemini-nano-banana-2.1...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Concept Art ({conceptAspect})</span>
                </>
              )}
            </button>
          </div>

          {/* Right Concept Preview & Animate Bridge */}
          <div className="lg:col-span-6 space-y-5">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center space-x-2">
                  <ImageIcon className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-white">Concept Frame Viewer</h3>
                </div>
                {activeConceptImage && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/30">
                    {activeConceptImage.aspectRatio} • 1K
                  </span>
                )}
              </div>

              {activeConceptImage ? (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden bg-black border border-zinc-800 flex items-center justify-center max-h-[380px]">
                    <img
                      src={activeConceptImage.imageUrl}
                      alt="Concept"
                      className="w-full h-auto object-contain max-h-[380px]"
                    />
                  </div>

                  <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-xs text-zinc-300">
                    <span className="font-semibold text-purple-300">Prompt: </span>
                    {activeConceptImage.prompt}
                  </div>

                  {/* Bridge Buttons: Edit with Prompt, Send to Animator, or Download */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                    <button
                      onClick={() => handleEditConceptImage(activeConceptImage)}
                      className="py-2.5 px-3 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/40 text-xs font-bold flex items-center justify-center space-x-1.5 transition"
                    >
                      <Pencil className="w-3.5 h-3.5 text-purple-400" />
                      <span>Edit with Prompt</span>
                    </button>

                    <button
                      onClick={() => handleSendConceptToAnimator(activeConceptImage)}
                      className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold flex items-center justify-center space-x-1.5 transition"
                    >
                      <Video className="w-4 h-4 text-cyan-400" />
                      <span>Animate (Omni)</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <a
                      href={activeConceptImage.imageUrl}
                      download={`concept_${activeConceptImage.id}.${activeConceptImage.imageUrl.endsWith('.jpg') ? 'jpg' : 'png'}`}
                      className="py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-white border border-zinc-700 text-xs font-bold flex items-center justify-center space-x-1.5 transition text-center"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="py-16 flex flex-col items-center justify-center text-center text-zinc-500 space-y-2">
                  <ImageIcon className="w-10 h-10 text-zinc-700" />
                  <p className="text-xs">No concept art generated yet. Enter a prompt and generate your first frame.</p>
                </div>
              )}
            </div>

            {/* Concept History Reel */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
                Concept Frame Reel ({conceptHistory.length})
              </h3>

              {conceptHistory.length === 0 ? (
                <p className="text-xs text-zinc-600 italic">No frames generated in this session.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-1">
                  {conceptHistory.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setActiveConceptImage(item)}
                      className="group cursor-pointer rounded-xl overflow-hidden border border-zinc-800 hover:border-purple-500/50 bg-zinc-950 p-1.5 space-y-1.5 transition"
                    >
                      <div className="relative aspect-video rounded-lg overflow-hidden bg-black flex items-center justify-center">
                        <img src={item.imageUrl} alt="Frame" className="w-full h-full object-cover" />
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono text-center truncate">
                        {item.aspectRatio}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
