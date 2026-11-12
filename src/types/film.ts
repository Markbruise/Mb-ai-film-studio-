export type ProviderId = 'gemini-omni' | 'veo3' | 'veo2' | 'runway-gen3' | 'sora' | 'luma' | 'kling' | 'pika';

export type StudioLanguage = 'en' | 'fr' | 'es' | 'sw' | 'rw' | 'pt' | 'ar' | 'zh' | 'hi';

export type VisualStylePreset =
  | 'Cinematic Realism'
  | 'Neo-Noir'
  | 'Sci-Fi Anamorphic'
  | 'Documentary'
  | 'Classic 35mm Film'
  | 'Vibrant Animation';

export type WorkflowStage =
  | 'welcome'
  | 'screenplay'
  | 'breakdown'
  | 'characters'
  | 'storyboard'
  | 'production'
  | 'timeline'
  | 'audio'
  | 'continuity'
  | 'creative'
  | 'preview'
  | 'export'
  | 'projects'
  | 'assets'
  | 'settings'
  | 'help';

export interface VideoProviderSpec {
  id: ProviderId;
  name: string;
  tagline: string;
  maxClipDuration: number;
  defaultDuration: number;
  minClipDuration: number;
  supportedResolutions: string[];
  referenceImageSupport: boolean;
  cameraControlSupport: boolean;
  colorGradingSupport: boolean;
  badgeColor: string;
}

export const PROVIDER_SPECS: Record<ProviderId, VideoProviderSpec> = {
  'gemini-omni': {
    id: 'gemini-omni',
    name: 'Google Gemini Omni Flash',
    tagline: 'Official multimodal Omni Flash video engine with text-to-video, image-to-video & reference conditioning',
    maxClipDuration: 15.0,
    defaultDuration: 6.0,
    minClipDuration: 3.0,
    supportedResolutions: ['720p', '1080p', '4K Cinema', '360p'],
    referenceImageSupport: true,
    cameraControlSupport: true,
    colorGradingSupport: true,
    badgeColor: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  },
  veo3: {
    id: 'veo3',
    name: 'Google Veo 3.1',
    tagline: 'Ultra-realistic human actors, deep physics simulation & 4K cinematic fidelity',
    maxClipDuration: 10.0,
    defaultDuration: 6.0,
    minClipDuration: 2.0,
    supportedResolutions: ['1080p', '4K Cinema', '720p'],
    referenceImageSupport: true,
    cameraControlSupport: true,
    colorGradingSupport: true,
    badgeColor: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400',
  },
  veo2: {
    id: 'veo2',
    name: 'Google Veo 2',
    tagline: 'High cinematic fidelity with multimodal frame conditioning & 4K upscaling',
    maxClipDuration: 8.0,
    defaultDuration: 6.0,
    minClipDuration: 2.0,
    supportedResolutions: ['1080p', '4K Cinema', '720p'],
    referenceImageSupport: true,
    cameraControlSupport: true,
    colorGradingSupport: true,
    badgeColor: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  },
  'runway-gen3': {
    id: 'runway-gen3',
    name: 'Runway Gen-3 Alpha',
    tagline: 'Precision director motion brushes, camera trajectories & temporal lock',
    maxClipDuration: 10.0,
    defaultDuration: 5.0,
    minClipDuration: 2.0,
    supportedResolutions: ['1080p', '720p'],
    referenceImageSupport: true,
    cameraControlSupport: true,
    colorGradingSupport: true,
    badgeColor: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
  },
  sora: {
    id: 'sora',
    name: 'OpenAI Sora',
    tagline: 'Deep narrative physics, multi-character interaction & sustained pacing',
    maxClipDuration: 20.0,
    defaultDuration: 10.0,
    minClipDuration: 3.0,
    supportedResolutions: ['1080p', '4K Cinema'],
    referenceImageSupport: true,
    cameraControlSupport: true,
    colorGradingSupport: false,
    badgeColor: 'border-purple-500/40 bg-purple-500/10 text-purple-400',
  },
  luma: {
    id: 'luma',
    name: 'Luma Dream Machine',
    tagline: 'Ultra-smooth camera dollies, cinematic crane movements & rapid rendering',
    maxClipDuration: 5.0,
    defaultDuration: 5.0,
    minClipDuration: 2.0,
    supportedResolutions: ['1080p', '720p'],
    referenceImageSupport: true,
    cameraControlSupport: true,
    colorGradingSupport: false,
    badgeColor: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  },
  kling: {
    id: 'kling',
    name: 'Kling AI 1.5 Pro',
    tagline: 'Bio-realistic motion, facial emotion fidelity & complex action framing',
    maxClipDuration: 10.0,
    defaultDuration: 5.0,
    minClipDuration: 2.0,
    supportedResolutions: ['1080p'],
    referenceImageSupport: true,
    cameraControlSupport: false,
    colorGradingSupport: false,
    badgeColor: 'border-rose-500/40 bg-rose-500/10 text-rose-400',
  },
  pika: {
    id: 'pika',
    name: 'Pika 2.0 VFX',
    tagline: 'Dynamic stylization, seamless morphing & punchy short narrative beats',
    maxClipDuration: 4.0,
    defaultDuration: 4.0,
    minClipDuration: 1.5,
    supportedResolutions: ['1080p', '720p'],
    referenceImageSupport: true,
    cameraControlSupport: false,
    colorGradingSupport: false,
    badgeColor: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400',
  },
};

export type ScreenDirection = 'left-to-right' | 'right-to-left' | 'towards-camera' | 'away-from-camera' | 'static';

export interface VisualContinuityInfo {
  screenDirection: ScreenDirection;
  lightingKey: string;
  colorPalette: string;
  cameraStyle: string;
  timeOfDay: string;
  location: string;
  props: string[];
  previousShotSummary?: string;
  nextShotSummary?: string;
}

export type GenerationStatus = 'queued' | 'generating' | 'completed' | 'failed';

export type TransitionType = 'cut' | 'cross_dissolve' | 'fade_black' | 'wipe_left' | 'wipe_right' | 'whip_pan';

export interface TransitionPreset {
  id: TransitionType;
  name: string;
  tagline: string;
  defaultDuration: number;
}

export const TRANSITION_PRESETS: Record<TransitionType, TransitionPreset> = {
  cut: {
    id: 'cut',
    name: 'Standard Cut',
    tagline: 'Direct cut with no transition delay (0.0s)',
    defaultDuration: 0,
  },
  cross_dissolve: {
    id: 'cross_dissolve',
    name: 'Cross-Dissolve',
    tagline: 'Smooth optical blend between outgoing and incoming footage',
    defaultDuration: 0.8,
  },
  fade_black: {
    id: 'fade_black',
    name: 'Fade to Black',
    tagline: 'Dips fully to black before rising into the next scene',
    defaultDuration: 1.0,
  },
  wipe_left: {
    id: 'wipe_left',
    name: 'Wipe Left',
    tagline: 'Horizontal wipe revealing incoming footage right-to-left',
    defaultDuration: 0.6,
  },
  wipe_right: {
    id: 'wipe_right',
    name: 'Wipe Right',
    tagline: 'Horizontal wipe revealing incoming footage left-to-right',
    defaultDuration: 0.6,
  },
  whip_pan: {
    id: 'whip_pan',
    name: 'Whip Pan',
    tagline: 'Rapid dynamic camera swivel with horizontal directional blur',
    defaultDuration: 0.4,
  },
};

export interface CharacterProfile {
  id: string;
  name: string;
  role: string;
  age?: string;
  appearance: string;
  costume: string;
  personality?: string;
  voiceProfile?: string;
  visualNotes: string;
  referenceImageUrl?: string;
  consistencyPrompt?: string;
}

export interface LocationProfile {
  id: string;
  name: string;
  environmentType: string;
  lighting: string;
  colorKey: string;
  atmosphere: string;
  referenceImageUrl?: string;
  visualNotes?: string;
}

export interface StoryboardFrame {
  frameId: string;
  shotId: string;
  sceneId: string;
  frameNumber: number;
  title: string;
  description: string;
  shotType: string;
  cameraAngle: string;
  cameraMovement: string;
  composition: string;
  lightingNotes: string;
  imageUrl?: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvedAt?: string;
  revisionNotes?: string;
}

export interface VideoClip {
  clipId: string;
  filmProjectId: string;
  sceneId: string;
  shotId: string;
  clipIndexInShot: number;
  totalClipsInShot: number;
  prompt: string;
  negativePrompt?: string;
  duration: number;
  provider: ProviderId;
  model: string;
  generationStatus: GenerationStatus;
  progress: number;
  videoUrl: string;
  storageReference: string;
  timestamp: string;
  timecode: string;
  characterReferences: string[];
  visualContinuity: VisualContinuityInfo;
  error?: string;
  retryCount: number;
  timelineTrackIndex: number;
  timelineStart: number;
  inPoint: number;
  outPoint: number;
  transitionIn?: TransitionType;
  transitionDuration?: number;
  generationMode?: 'text-to-video' | 'image-to-video' | 'keyframe-interpolation';
  firstFrameImage?: string;
  lastFrameImage?: string;
  resolution?: string;
}

export interface Shot {
  shotId: string;
  sceneId: string;
  actId: string;
  shotNumber: number;
  title: string;
  shotType:
    | 'Extreme Wide'
    | 'Wide Establishing'
    | 'Medium Shot'
    | 'Medium Close-Up'
    | 'Close-Up'
    | 'Extreme Close-Up'
    | 'POV'
    | 'Over-The-Shoulder'
    | 'Aerial Drone'
    | 'Tracking Dolly';
  cameraMovement:
    | 'Static'
    | 'Pan Left'
    | 'Pan Right'
    | 'Tilt Up'
    | 'Tilt Down'
    | 'Push In / Dolly'
    | 'Pull Back'
    | 'Steadicam Follow'
    | 'Orbital Crane';
  angle: 'Eye Level' | 'Low Angle' | 'High Angle' | 'Dutch Angle' | 'Birds Eye';
  description: string;
  dialogueSnippet?: {
    speaker: string;
    line: string;
  };
  characters: string[];
  targetDuration: number;
  provider: ProviderId;
  model: string;
  visualContinuity: VisualContinuityInfo;
  clipIds: string[];
}

export interface Scene {
  sceneId: string;
  actId: string;
  sceneNumber: number;
  heading: string;
  location: string;
  timeOfDay: 'DAWN' | 'DAY' | 'GOLDEN HOUR' | 'DUSK' | 'NIGHT';
  mood: string;
  summary: string;
  targetDuration: number;
  calculatedDuration: number;
  shots: Shot[];
  approved?: boolean;
}

export interface Act {
  actId: string;
  actNumber: number;
  title: string;
  summary: string;
  targetDuration: number;
  sceneIds: string[];
}

export interface DialogueTrackItem {
  id: string;
  character: string;
  text: string;
  startTime: number;
  duration: number;
  volume: number;
  voiceStyle?: string;
  language?: StudioLanguage;
  audioUrl?: string;
}

export interface AudioSFXItem {
  id: string;
  name: string;
  category: 'foley' | 'ambience' | 'impact' | 'riser' | 'action';
  startTime: number;
  duration: number;
  volume: number;
  audioUrl?: string;
}

export interface MusicTrackItem {
  id: string;
  title: string;
  mood: string;
  bpm: number;
  startTime: number;
  duration: number;
  volume: number;
  audioUrl?: string;
}

export interface ContinuityIssue {
  id: string;
  clipAId: string;
  clipBId: string;
  sceneId: string;
  shotNumberA: number;
  shotNumberB: number;
  issueType: 'screen_direction' | 'lighting' | 'costume' | 'time_of_day' | 'props' | 'camera_jump';
  severity: 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
  applied: boolean;
}

export interface GenerationJob {
  jobId: string;
  filmProjectId: string;
  type: 'generate_clip' | 'batch_scene' | 'continuity_audit' | 'timeline_assembly' | 'render_export';
  targetId: string;
  provider?: string;
  title: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  createdAt: number;
  completedAt?: number;
  error?: string;
  retryCount: number;
  videoUrl?: string;
  downloadUrl?: string;
  fileSize?: number;
  duration?: number;
  resolution?: string;
}

export interface RenderExportSettings {
  resolution: '720p' | '1080p' | '4K Cinema';
  aspectRatio: '16:9' | '2.39:1' | '9:16' | '1:1' | '4:3';
  fps: 24 | 30 | 60;
  codec: 'H.264' | 'ProRes 422' | 'HEVC' | 'VP9 / WebM';
  burnSubtitles: boolean;
  subtitleLanguage?: StudioLanguage;
  colorGradeLUT:
    | 'Cinematic Teal & Orange'
    | 'Noir High-Contrast'
    | 'Sci-Fi Cyberpunk'
    | 'Kodak 5219 Warm'
    | 'Clean Rec709';
  audioMix: {
    dialogueLevel: number;
    musicLevel: number;
    sfxLevel: number;
    masterGain: number;
  };
}

export interface ExportRecord {
  id: string;
  projectId: string;
  projectTitle: string;
  filename: string;
  videoUrl: string;
  downloadUrl: string;
  resolution: string;
  aspectRatio: string;
  codec: string;
  language?: StudioLanguage;
  duration: number;
  fileSize: number;
  createdAt: string;
  validated?: boolean;
}

export interface AssetLibraryItem {
  id: string;
  kind: 'character' | 'location' | 'storyboard' | 'video' | 'audio' | 'export';
  name: string;
  url: string;
  projectId?: string;
  createdAt: string;
  sizeBytes?: number;
  meta?: Record<string, any>;
}

export interface StudioUserSettings {
  uiLanguage: StudioLanguage;
  defaultScreenplayLanguage: StudioLanguage;
  defaultOutputLanguage: StudioLanguage;
  defaultProvider: ProviderId;
  autoSaveIntervalSec: number;
  preferredResolution: '720p' | '1080p' | '4K Cinema';
}

export interface FilmProject {
  id: string;
  title: string;
  description?: string;
  genre: string;
  logline: string;
  targetDurationSeconds: number;
  actualAssembledDuration: number;
  fps: number;
  aspectRatio: '16:9' | '2.39:1' | '9:16' | '1:1' | '4:3';
  resolution: '720p' | '1080p' | '4K Cinema';
  screenplayLanguage?: StudioLanguage;
  outputLanguage?: StudioLanguage;
  visualStyle?: VisualStylePreset;
  targetAudience?: string;
  status?: 'draft' | 'in_production' | 'ready_for_edit' | 'exported' | 'archived';
  archived?: boolean;
  breakdownApproved?: boolean;
  storyboardApproved?: boolean;
  screenplayRaw: string;
  acts: Act[];
  scenes: Scene[];
  shots: Shot[];
  clips: VideoClip[];
  dialogueTracks: DialogueTrackItem[];
  sfxTracks: AudioSFXItem[];
  musicTracks: MusicTrackItem[];
  continuityIssues: ContinuityIssue[];
  defaultProvider: ProviderId;
  exportSettings: RenderExportSettings;
  characters?: { name: string; visualNotes: string; costume: string }[];
  locations?: { name: string; lighting: string; colorKey: string }[];
  characterProfiles?: CharacterProfile[];
  locationProfiles?: LocationProfile[];
  storyboardFrames?: StoryboardFrame[];
  createdAt: string;
  updatedAt: string;
}

export interface TimelineAccessStatus {
  unlocked: boolean;
  totalClips: number;
  readyClips: number;
  blockedClips: Array<{
    clipId: string;
    sceneNumber: number;
    shotNumber: number;
    status: GenerationStatus;
    reason: string;
  }>;
}

/**
 * Authoritative Strict Timeline Gate Verification:
 * Timeline Editor MUST remain locked until clips.length >= 1 AND
 * every clip has completed generation with a verified playable real video URL.
 */
export function evaluateTimelineAccess(project: FilmProject): TimelineAccessStatus {
  const clips = project.clips || [];
  if (clips.length === 0) {
    return {
      unlocked: false,
      totalClips: 0,
      readyClips: 0,
      blockedClips: [
        {
          clipId: 'none',
          sceneNumber: 1,
          shotNumber: 1,
          status: 'queued',
          reason: 'No video clips have been broken down or generated yet.',
        },
      ],
    };
  }

  const blockedClips: TimelineAccessStatus['blockedClips'] = [];
  let readyClips = 0;

  for (const clip of clips) {
    const shot = project.shots.find((s) => s.shotId === clip.shotId);
    const scene = project.scenes.find((sc) => sc.sceneId === clip.sceneId);
    const hasRealUrl = Boolean(clip.videoUrl && !clip.videoUrl.startsWith('procedural://'));
    if (clip.generationStatus === 'completed' && hasRealUrl) {
      readyClips += 1;
    } else {
      let reason = 'Clip has not been generated yet.';
      if (clip.generationStatus === 'generating') reason = 'Video generation is currently in progress.';
      else if (clip.generationStatus === 'failed') reason = clip.error || 'Video generation failed; retry or upload custom footage.';
      else if (!hasRealUrl) reason = 'Missing real generated or uploaded MP4 video asset.';
      blockedClips.push({
        clipId: clip.clipId,
        sceneNumber: scene?.sceneNumber || 1,
        shotNumber: shot?.shotNumber || 1,
        status: clip.generationStatus,
        reason,
      });
    }
  }

  return {
    unlocked: blockedClips.length === 0 && readyClips === clips.length,
    totalClips: clips.length,
    readyClips,
    blockedClips,
  };
}
