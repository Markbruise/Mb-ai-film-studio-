import {
  FilmProject,
  Act,
  Scene,
  Shot,
  VideoClip,
  ProviderId,
  PROVIDER_SPECS,
  ScreenDirection,
  ContinuityIssue,
  DialogueTrackItem,
  AudioSFXItem,
  MusicTrackItem,
  CharacterProfile,
  LocationProfile,
  StoryboardFrame,
  StudioLanguage,
  VisualStylePreset,
} from '../types/film';
import { formatSMPTETimecode } from './timecode';

/**
 * Breakdown Engine: Translates a target film duration (4s - 7200s) + Screenplay
 * into Acts -> Scenes -> Shots -> Clips (respecting Provider limits).
 * Can accept structured AI output from Gemini or algorithmic breakdown.
 */

export interface BreakdownParams {
  projectId?: string;
  title: string;
  description?: string;
  genre: string;
  logline: string;
  targetDurationSeconds: number;
  provider: ProviderId;
  screenplay: string;
  screenplayLanguage?: StudioLanguage;
  outputLanguage?: StudioLanguage;
  visualStyle?: VisualStylePreset;
  targetAudience?: string;
  aspectRatio?: '16:9' | '2.39:1' | '9:16' | '1:1' | '4:3';
  resolution?: '720p' | '1080p' | '4K Cinema';
  characters?: { name: string; visualNotes: string; costume: string }[];
  locations?: { name: string; lighting: string; colorKey: string }[];
  characterProfiles?: CharacterProfile[];
  locationProfiles?: LocationProfile[];
  aiBreakdown?: any; // Structured output from Gemini breakdown API
}

/**
 * Helper: Extracts character names that appear as dialogue speakers in screenplay text
 */
export function deriveCharactersFromScript(
  scriptText: string,
  defaultName = 'Elena Vance'
): { name: string; visualNotes: string; costume: string }[] {
  const charactersMap = new Map<string, { name: string; visualNotes: string; costume: string }>();
  const lines = scriptText.split('\n');

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    const nextLine = lines[i + 1].trim();
    // Character cue: usually 2-25 uppercase letters, possibly with (V.O.) or (O.S.)
    if (/^[A-Z][A-Z0-9\s\.\-]{1,24}(?:\s*\([A-Z\.\s]+\))?$/.test(line) && nextLine.length > 0 && !line.startsWith('SCENE') && !line.startsWith('INT.') && !line.startsWith('EXT.')) {
      const cleanName = line.replace(/\s*\([^\)]+\)/g, '').trim();
      if (cleanName && cleanName.length >= 2 && !charactersMap.has(cleanName)) {
        charactersMap.set(cleanName, {
          name: cleanName,
          visualNotes: `Key dramatic figure in ${cleanName}'s narrative arc.`,
          costume: 'Cinematic costume designed for narrative genre tone.',
        });
      }
    }
  }

  if (charactersMap.size === 0) {
    return [{ name: defaultName, visualNotes: 'Protagonist', costume: 'Standard wardrobe' }];
  }
  return Array.from(charactersMap.values());
}

/**
 * Helper: Extracts scene locations from INT./EXT. screenplay headings
 */
export function deriveLocationsFromScript(
  scriptText: string
): { name: string; lighting: string; colorKey: string }[] {
  const locations: { name: string; lighting: string; colorKey: string }[] = [];
  const lines = scriptText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/(?:SCENE\s*\d+\s*[-–]\s*)?(INT\.|EXT\.|INT\/EXT\.)\s+([^-–\n]+)(?:[-–]\s*(.+))?/i);
    if (match) {
      const locName = match[2].trim();
      const tod = (match[3] || 'DAY').trim().toUpperCase();
      if (locName && !locations.some((l) => l.name.toLowerCase() === locName.toLowerCase())) {
        locations.push({
          name: locName,
          lighting: tod.includes('NIGHT')
            ? 'Moody atmospheric night illumination with rich ambient shadows'
            : tod.includes('GOLDEN')
            ? 'Warm golden-hour specular lighting'
            : 'Balanced cinematic key lighting with defined contrast',
          colorKey: tod.includes('NIGHT') ? 'Cobalt blue, deep shadow, tungsten amber' : 'Natural daylight, warm highlights',
        });
      }
    }
  }

  return locations;
}

interface ParsedSceneInfo {
  heading: string;
  location: string;
  timeOfDay: 'DAWN' | 'DAY' | 'GOLDEN HOUR' | 'DUSK' | 'NIGHT';
  mood: string;
  summary: string;
  dialogueSamples: { speaker: string; line: string }[];
}

/**
 * Parses screenplay text into scene segments
 */
export function parseScreenplayScenes(screenplay: string, defaultGenre = 'Cinematic Drama'): ParsedSceneInfo[] {
  const scenes: ParsedSceneInfo[] = [];
  const lines = screenplay.split('\n');

  let currentHeading = '';
  let currentLocation = '';
  let currentTimeOfDay: 'DAWN' | 'DAY' | 'GOLDEN HOUR' | 'DUSK' | 'NIGHT' = 'NIGHT';
  let currentAction: string[] = [];
  let currentDialogues: { speaker: string; line: string }[] = [];

  const flushScene = () => {
    if (currentHeading) {
      scenes.push({
        heading: currentHeading,
        location: currentLocation || 'Main Stage',
        timeOfDay: currentTimeOfDay,
        mood: currentAction.join(' ').slice(0, 100) || `${defaultGenre} intensity`,
        summary: currentAction.join(' ').slice(0, 200) || `Scene unfolding at ${currentLocation}`,
        dialogueSamples: [...currentDialogues],
      });
    }
    currentHeading = '';
    currentLocation = '';
    currentTimeOfDay = 'NIGHT';
    currentAction = [];
    currentDialogues = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Heading matcher
    const headingMatch = rawLine.match(/^(?:SCENE\s*\d+\s*[-–]\s*)?(INT\.|EXT\.|INT\/EXT\.)\s+([^-–\n]+)(?:[-–]\s*(.+))?/i);
    if (headingMatch) {
      flushScene();
      currentHeading = rawLine;
      currentLocation = headingMatch[2].trim();
      const todStr = (headingMatch[3] || '').toUpperCase();
      if (todStr.includes('GOLDEN')) currentTimeOfDay = 'GOLDEN HOUR';
      else if (todStr.includes('DAWN')) currentTimeOfDay = 'DAWN';
      else if (todStr.includes('DUSK')) currentTimeOfDay = 'DUSK';
      else if (todStr.includes('DAY')) currentTimeOfDay = 'DAY';
      else currentTimeOfDay = 'NIGHT';
      continue;
    }

    // Check if character line
    if (/^[A-Z][A-Z0-9\s\.\-]{1,24}(?:\s*\([A-Z\.\s]+\))?$/.test(rawLine) && i < lines.length - 1) {
      const speaker = rawLine.replace(/\s*\([^\)]+\)/g, '').trim();
      const dialogueText = lines[i + 1]?.trim() || '';
      if (dialogueText && !dialogueText.startsWith('SCENE') && !dialogueText.startsWith('INT.') && !dialogueText.startsWith('EXT.')) {
        currentDialogues.push({ speaker, line: dialogueText });
        i++; // skip dialogue line
        continue;
      }
    }

    currentAction.push(rawLine);
  }

  flushScene();
  return scenes;
}

export function generateFilmBreakdown(params: BreakdownParams): FilmProject {
  const {
    projectId = `proj_${Date.now()}`,
    title,
    genre,
    logline,
    targetDurationSeconds,
    provider,
    screenplay,
    characters = [],
    locations = [],
    aiBreakdown,
  } = params;

  const providerSpec = PROVIDER_SPECS[provider] || PROVIDER_SPECS['gemini-omni'];
  const target = Math.max(4, Math.min(7200, Math.round(targetDurationSeconds)));
  const primaryChar = characters[0]?.name || 'Protagonist';

  // Check if we have structured AI breakdown from Gemini
  if (aiBreakdown && Array.isArray(aiBreakdown.scenes) && aiBreakdown.scenes.length > 0) {
    return buildProjectFromAIBreakdown(params, aiBreakdown, providerSpec, target);
  }

  // --- Algorithmic Breakdown Engine (Parses Screenplay) ---
  const parsedScenes = parseScreenplayScenes(screenplay, genre);

  // If screenplay provided real scenes, use them; otherwise use calibrated narrative archetypes
  const sceneList = parsedScenes.length > 0 ? parsedScenes : [
    {
      heading: 'EXT. PRIMARY HORIZON - ESTABLISHING - NIGHT',
      location: locations[0]?.name || 'Central Horizon',
      timeOfDay: 'NIGHT' as const,
      mood: 'Suspenseful & Majestic',
      summary: 'Grand establishing vantage setting the narrative world into motion.',
      dialogueSamples: [{ speaker: primaryChar, line: 'Confirming baseline telemetry and coordinates.' }],
    },
    {
      heading: 'INT. COMMAND CORE / INTERIOR - CONTINUOUS',
      location: locations[1]?.name || locations[0]?.name || 'Command Chamber',
      timeOfDay: 'NIGHT' as const,
      mood: 'Claustrophobic & Urgent',
      summary: 'Tension escalates as characters confront unexpected signals.',
      dialogueSamples: [{ speaker: primaryChar, line: 'The frequency is shifting. We have seconds to react.' }],
    },
    {
      heading: 'EXT. TERRAIN FRACTURE / CLIMAX - GOLDEN HOUR',
      location: locations[2]?.name || locations[0]?.name || 'Open Frontier',
      timeOfDay: 'GOLDEN HOUR' as const,
      mood: 'Epic & High Stakes',
      summary: 'High stakes decision point reaching dramatic resolution.',
      dialogueSamples: [{ speaker: primaryChar, line: 'This changes everything we knew.' }],
    },
  ];

  // Act structure distribution
  const actsCount = target <= 30 ? 1 : target <= 120 ? 2 : 3;
  const actWeights = actsCount === 1 ? [1.0] : actsCount === 2 ? [0.4, 0.6] : [0.25, 0.5, 0.25];

  const acts: Act[] = [];
  const scenes: Scene[] = [];
  const allShots: Shot[] = [];
  const allClips: VideoClip[] = [];

  for (let a = 0; a < actsCount; a++) {
    const actId = `act_${a + 1}`;
    const actDurationTarget = Math.round(target * actWeights[a]);
    const actTitle =
      actsCount === 1
        ? 'Act I: Complete Dramatic Movement'
        : a === 0
        ? 'Act I: Inciting Incident & Setup'
        : a === 1
        ? 'Act II: Rising Confrontation & Abyss'
        : 'Act III: Climax & Resonant Resolution';

    acts.push({
      actId,
      actNumber: a + 1,
      title: actTitle,
      summary: `Narrative progression covering ${actDurationTarget} seconds of visual storytelling.`,
      targetDuration: actDurationTarget,
      sceneIds: [],
    });
  }

  // Distribute scenes across acts
  const totalNumScenes = Math.max(sceneList.length, actsCount);
  const scenesPerAct = Math.max(1, Math.floor(totalNumScenes / actsCount));
  let remainingScenes = totalNumScenes;
  let sceneCounter = 1;
  let accumulatedTime = 0;
  let globalShotIndex = 1;
  let globalClipIndex = 1;

  // Shot varieties
  const shotTypes: Array<{
    type: Shot['shotType'];
    cam: Shot['cameraMovement'];
    angle: Shot['angle'];
    dir: ScreenDirection;
  }> = [
    { type: 'Wide Establishing', cam: 'Push In / Dolly', angle: 'Eye Level', dir: 'left-to-right' },
    { type: 'Medium Shot', cam: 'Steadicam Follow', angle: 'Eye Level', dir: 'towards-camera' },
    { type: 'Close-Up', cam: 'Static', angle: 'Eye Level', dir: 'static' },
    { type: 'Over-The-Shoulder', cam: 'Pan Right', angle: 'Low Angle', dir: 'left-to-right' },
    { type: 'Aerial Drone', cam: 'Orbital Crane', angle: 'High Angle', dir: 'right-to-left' },
    { type: 'Extreme Close-Up', cam: 'Tilt Down', angle: 'Eye Level', dir: 'towards-camera' },
    { type: 'Tracking Dolly', cam: 'Pan Left', angle: 'Low Angle', dir: 'left-to-right' },
  ];

  acts.forEach((act, actIdx) => {
    const isLastAct = actIdx === acts.length - 1;
    const thisActScenesCount = isLastAct ? remainingScenes : scenesPerAct;
    remainingScenes -= thisActScenesCount;
    const sceneDurationSlice = act.targetDuration / Math.max(1, thisActScenesCount);

    for (let s = 0; s < thisActScenesCount; s++) {
      const sceneId = `scene_${sceneCounter}`;
      act.sceneIds.push(sceneId);

      const sceneData = sceneList[(sceneCounter - 1) % sceneList.length];
      const sceneTargetDuration = Math.max(3, Math.round(sceneDurationSlice));

      // Calculate number of shots in this scene
      const approxShotCount = Math.max(1, Math.round(sceneTargetDuration / Math.min(6, providerSpec.defaultDuration)));
      const shotDurationSlice = sceneTargetDuration / approxShotCount;
      const sceneShots: Shot[] = [];
      let sceneCalculatedDuration = 0;

      for (let sh = 0; sh < approxShotCount; sh++) {
        const shotId = `shot_${sceneCounter}_${sh + 1}`;
        const isLastShot = sh === approxShotCount - 1;
        let shotTargetDuration = Math.round(shotDurationSlice * 10) / 10;
        if (isLastShot) {
          shotTargetDuration = Math.max(2.0, Math.round((sceneTargetDuration - sceneCalculatedDuration) * 10) / 10);
        }
        sceneCalculatedDuration += shotTargetDuration;

        const shotConfig = shotTypes[(globalShotIndex - 1) % shotTypes.length];
        const dialogue = sceneData.dialogueSamples[sh % Math.max(1, sceneData.dialogueSamples.length)];

        const visualContinuity: Shot['visualContinuity'] = {
          screenDirection: shotConfig.dir,
          lightingKey: locations[0]?.lighting || 'High-contrast cinematic key with controlled rim lighting',
          colorPalette: locations[0]?.colorKey || 'Teal, amber, deep obsidian',
          cameraStyle: 'Anamorphic 35mm Prime with subtle halation & streak flare',
          timeOfDay: sceneData.timeOfDay,
          location: sceneData.location,
          props: ['Key narrative prop', 'Communication device', 'Tactical gear'],
          previousShotSummary: globalShotIndex > 1 ? `Follows Shot ${globalShotIndex - 1} camera motion` : 'Opening scene frame',
          nextShotSummary: `Cuts to Shot ${globalShotIndex + 1}`,
        };

        const shotObj: Shot = {
          shotId,
          sceneId,
          actId: act.actId,
          shotNumber: globalShotIndex,
          title: `Shot ${globalShotIndex}: ${shotConfig.type} (${sceneData.location})`,
          shotType: shotConfig.type,
          cameraMovement: shotConfig.cam,
          angle: shotConfig.angle,
          description: `${shotConfig.type} framing ${primaryChar} in ${sceneData.location}. Atmosphere: ${sceneData.mood}.`,
          dialogueSnippet: dialogue ? { speaker: dialogue.speaker, line: dialogue.line } : undefined,
          characters: [primaryChar],
          targetDuration: shotTargetDuration,
          provider,
          model: providerSpec.name,
          visualContinuity,
          clipIds: [],
        };

        // Subdivide shot into Video Clips if shot exceeds provider maxClipDuration
        const maxClip = providerSpec.maxClipDuration;
        let remainingShotDur = shotTargetDuration;
        const subClipDurations: number[] = [];

        while (remainingShotDur > 0) {
          if (remainingShotDur <= maxClip) {
            subClipDurations.push(Math.round(remainingShotDur * 10) / 10);
            remainingShotDur = 0;
          } else {
            const chunk = Math.min(maxClip, Math.max(providerSpec.minClipDuration, maxClip));
            subClipDurations.push(chunk);
            remainingShotDur = Math.round((remainingShotDur - chunk) * 10) / 10;
          }
        }

        const totalClipsInShot = subClipDurations.length;
        subClipDurations.forEach((clipDur, subIdx) => {
          const clipId = `clip_${globalClipIndex}`;
          shotObj.clipIds.push(clipId);

          const isSubdivided = totalClipsInShot > 1;
          const subPromptNote = isSubdivided
            ? ` [Sub-Shot Part ${subIdx + 1}/${totalClipsInShot}: Continuity anchored to preceding sub-clip vector]`
            : '';

          const clipPrompt = `Cinematic ${shotConfig.type}, ${shotConfig.angle}, ${shotConfig.cam} movement. ${shotObj.description}${subPromptNote}. Photorealistic 8K, Master grade: ${visualContinuity.colorPalette}. High temporal consistency.`;

          const clipObj: VideoClip = {
            clipId,
            filmProjectId: projectId,
            sceneId,
            shotId,
            clipIndexInShot: subIdx + 1,
            totalClipsInShot,
            prompt: clipPrompt,
            negativePrompt: 'blurry, flickering, morphing artifacts, distorted limbs, low resolution, bad hands, washed out',
            duration: clipDur,
            provider,
            model: `${providerSpec.name} v2.4`,
            generationStatus: 'queued',
            progress: 0,
            videoUrl: '',
            storageReference: '',
            timestamp: new Date().toISOString(),
            timecode: formatSMPTETimecode(accumulatedTime),
            characterReferences: [primaryChar],
            visualContinuity: { ...visualContinuity },
            retryCount: 0,
            timelineTrackIndex: 0,
            timelineStart: accumulatedTime,
            inPoint: 0,
            outPoint: clipDur,
            transitionIn: accumulatedTime === 0 ? 'fade_black' : 'cut',
            transitionDuration: accumulatedTime === 0 ? 0.8 : 0,
          };

          accumulatedTime += clipDur;
          allClips.push(clipObj);
          globalClipIndex++;
        });

        allShots.push(shotObj);
        sceneShots.push(shotObj);
        globalShotIndex++;
      }

      scenes.push({
        sceneId,
        actId: act.actId,
        sceneNumber: sceneCounter,
        heading: sceneData.heading,
        location: sceneData.location,
        timeOfDay: sceneData.timeOfDay,
        mood: sceneData.mood,
        summary: sceneData.summary,
        targetDuration: sceneTargetDuration,
        calculatedDuration: Math.round(sceneCalculatedDuration * 10) / 10,
        shots: sceneShots,
      });

      sceneCounter++;
    }
  });

  return assembleFinalProject({
    projectId,
    title,
    description: params.description,
    genre,
    logline,
    target,
    provider,
    screenplay,
    screenplayLanguage: params.screenplayLanguage,
    outputLanguage: params.outputLanguage,
    visualStyle: params.visualStyle,
    targetAudience: params.targetAudience,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution,
    characters,
    locations,
    characterProfiles: params.characterProfiles,
    locationProfiles: params.locationProfiles,
    acts,
    scenes,
    allShots,
    allClips,
    accumulatedTime,
    providerSpec,
  });
}

/**
 * Builds project from Gemini AI structured JSON output
 */
function buildProjectFromAIBreakdown(
  params: BreakdownParams,
  aiData: any,
  providerSpec: any,
  target: number
): FilmProject {
  const { projectId = `proj_${Date.now()}`, title, genre, logline, provider, screenplay } = params;

  const acts: Act[] = [];
  const scenes: Scene[] = [];
  const allShots: Shot[] = [];
  const allClips: VideoClip[] = [];

  let accumulatedTime = 0;
  let globalShotIndex = 1;
  let globalClipIndex = 1;

  // Process Acts
  const rawActs = Array.isArray(aiData.acts) && aiData.acts.length > 0 ? aiData.acts : [{ actNumber: 1, title: 'Act I', summary: 'Complete Narrative', targetDuration: target }];
  rawActs.forEach((a: any, idx: number) => {
    acts.push({
      actId: `act_${a.actNumber || idx + 1}`,
      actNumber: a.actNumber || idx + 1,
      title: a.title || `Act ${idx + 1}`,
      summary: a.summary || '',
      targetDuration: a.targetDuration || Math.round(target / rawActs.length),
      sceneIds: [],
    });
  });

  // Process Scenes & Shots
  const rawScenes = aiData.scenes || [];
  rawScenes.forEach((sc: any, scIdx: number) => {
    const sceneId = `scene_${sc.sceneNumber || scIdx + 1}`;
    const targetAct = acts[Math.min(acts.length - 1, Math.floor((scIdx / Math.max(1, rawScenes.length)) * acts.length))];
    targetAct.sceneIds.push(sceneId);

    const sceneShots: Shot[] = [];
    let sceneCalculatedDuration = 0;

    const rawShots = sc.shots || [];
    rawShots.forEach((sh: any) => {
      const shotId = `shot_${sc.sceneNumber || scIdx + 1}_${sh.shotNumber || globalShotIndex}`;
      const shotDur = Math.max(2.0, sh.duration || 5.0);
      sceneCalculatedDuration += shotDur;

      const visualContinuity: Shot['visualContinuity'] = {
        screenDirection: (sh.screenDirection as ScreenDirection) || 'left-to-right',
        lightingKey: sh.lightingKey || 'Cinematic natural key',
        colorPalette: sh.colorPalette || 'Master balanced grade',
        cameraStyle: '35mm anamorphic prime',
        timeOfDay: sc.timeOfDay || 'NIGHT',
        location: sc.location || 'Scene Location',
        props: [],
        previousShotSummary: globalShotIndex > 1 ? `Follows Shot ${globalShotIndex - 1}` : 'Scene start',
        nextShotSummary: `Cuts to Shot ${globalShotIndex + 1}`,
      };

      const shotObj: Shot = {
        shotId,
        sceneId,
        actId: targetAct.actId,
        shotNumber: globalShotIndex,
        title: `Shot ${globalShotIndex}: ${sh.shotType || 'Cinematic Shot'} (${sc.location || 'Location'})`,
        shotType: (sh.shotType as Shot['shotType']) || 'Wide Establishing',
        cameraMovement: (sh.cameraMovement as Shot['cameraMovement']) || 'Push In / Dolly',
        angle: (sh.angle as Shot['angle']) || 'Eye Level',
        description: sh.description || `Cinematic visual capture in ${sc.location}`,
        characters: [params.characters?.[0]?.name || 'Protagonist'],
        targetDuration: shotDur,
        provider,
        model: providerSpec.name,
        visualContinuity,
        clipIds: [],
      };

      // Subdivide shot into Video Clips if shot exceeds provider maxClipDuration
      const maxClip = providerSpec.maxClipDuration;
      let remainingDur = shotDur;
      const subClipDurations: number[] = [];

      while (remainingDur > 0) {
        if (remainingDur <= maxClip) {
          subClipDurations.push(Math.round(remainingDur * 10) / 10);
          remainingDur = 0;
        } else {
          const chunk = Math.min(maxClip, Math.max(providerSpec.minClipDuration, maxClip));
          subClipDurations.push(chunk);
          remainingDur = Math.round((remainingDur - chunk) * 10) / 10;
        }
      }

      const totalClips = subClipDurations.length;
      subClipDurations.forEach((clipDur, subIdx) => {
        const clipId = `clip_${globalClipIndex}`;
        shotObj.clipIds.push(clipId);

        const subNote = totalClips > 1 ? ` [Part ${subIdx + 1}/${totalClips}: Continuous shot motion]` : '';
        const clipPrompt = `Cinematic ${shotObj.shotType}, ${shotObj.angle}, ${shotObj.cameraMovement}. ${shotObj.description}${subNote}. 8K Master color grade: ${visualContinuity.colorPalette}. High temporal consistency.`;

        const clipObj: VideoClip = {
          clipId,
          filmProjectId: projectId,
          sceneId,
          shotId,
          clipIndexInShot: subIdx + 1,
          totalClipsInShot: totalClips,
          prompt: clipPrompt,
          negativePrompt: 'blurry, flickering, morphing artifacts, distorted limbs, low resolution, bad hands, washed out',
          duration: clipDur,
          provider,
          model: `${providerSpec.name} v2.4`,
          generationStatus: 'queued',
          progress: 0,
          videoUrl: '',
          storageReference: '',
          timestamp: new Date().toISOString(),
          timecode: formatSMPTETimecode(accumulatedTime),
          characterReferences: [params.characters?.[0]?.name || 'Protagonist'],
          visualContinuity: { ...visualContinuity },
          retryCount: 0,
          timelineTrackIndex: 0,
          timelineStart: accumulatedTime,
          inPoint: 0,
          outPoint: clipDur,
          transitionIn: accumulatedTime === 0 ? 'fade_black' : 'cut',
          transitionDuration: accumulatedTime === 0 ? 0.8 : 0,
        };

        accumulatedTime += clipDur;
        allClips.push(clipObj);
        globalClipIndex++;
      });

      allShots.push(shotObj);
      sceneShots.push(shotObj);
      globalShotIndex++;
    });

    scenes.push({
      sceneId,
      actId: targetAct.actId,
      sceneNumber: sc.sceneNumber || scIdx + 1,
      heading: sc.heading || `SCENE ${scIdx + 1}`,
      location: sc.location || 'Location',
      timeOfDay: (sc.timeOfDay as Scene['timeOfDay']) || 'NIGHT',
      mood: sc.mood || 'Cinematic',
      summary: sc.heading || '',
      targetDuration: sc.targetDuration || Math.round(sceneCalculatedDuration),
      calculatedDuration: Math.round(sceneCalculatedDuration * 10) / 10,
      shots: sceneShots,
    });
  });

  return assembleFinalProject({
    projectId,
    title: aiData.title || title,
    description: params.description,
    genre: aiData.genre || genre,
    logline: aiData.logline || logline,
    target,
    provider,
    screenplay,
    screenplayLanguage: params.screenplayLanguage,
    outputLanguage: params.outputLanguage,
    visualStyle: params.visualStyle,
    targetAudience: params.targetAudience,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution,
    characters: params.characters,
    locations: params.locations,
    characterProfiles: params.characterProfiles,
    locationProfiles: params.locationProfiles,
    acts,
    scenes,
    allShots,
    allClips,
    accumulatedTime,
    providerSpec,
  });
}

function assembleFinalProject(config: {
  projectId: string;
  title: string;
  description?: string;
  genre: string;
  logline: string;
  target: number;
  provider: ProviderId;
  screenplay: string;
  screenplayLanguage?: StudioLanguage;
  outputLanguage?: StudioLanguage;
  visualStyle?: VisualStylePreset;
  targetAudience?: string;
  aspectRatio?: '16:9' | '2.39:1' | '9:16' | '1:1' | '4:3';
  resolution?: '720p' | '1080p' | '4K Cinema';
  characters?: { name: string; visualNotes: string; costume: string }[];
  locations?: { name: string; lighting: string; colorKey: string }[];
  characterProfiles?: CharacterProfile[];
  locationProfiles?: LocationProfile[];
  acts: Act[];
  scenes: Scene[];
  allShots: Shot[];
  allClips: VideoClip[];
  accumulatedTime: number;
  providerSpec: any;
}): FilmProject {
  const {
    projectId,
    title,
    genre,
    logline,
    target,
    provider,
    screenplay,
    acts,
    scenes,
    allShots,
    allClips,
    accumulatedTime,
    providerSpec,
  } = config;

  // Auto-calibrate last clip if slight precision discrepancy
  const actualAssembledDuration = Math.round(accumulatedTime * 10) / 10;
  const delta = Math.round((target - actualAssembledDuration) * 10) / 10;

  if (Math.abs(delta) > 0.1 && allClips.length > 0) {
    const lastClip = allClips[allClips.length - 1];
    const newDur = Math.max(providerSpec.minClipDuration, Math.round((lastClip.duration + delta) * 10) / 10);
    lastClip.duration = newDur;
    lastClip.outPoint = newDur;
  }

  // Re-verify exact assembled duration after calibration
  let calibratedTotal = 0;
  allClips.forEach((c) => {
    c.timelineStart = calibratedTotal;
    c.timecode = formatSMPTETimecode(calibratedTotal);
    calibratedTotal += c.duration;
  });
  const finalAssembledDuration = Math.round(calibratedTotal * 10) / 10;

  // Generate dialogue tracks
  const dialogueTracks: DialogueTrackItem[] = [];
  allShots.forEach((shot) => {
    if (shot.dialogueSnippet) {
      const parentClip = allClips.find((c) => c.shotId === shot.shotId);
      if (parentClip) {
        dialogueTracks.push({
          id: `dlg_${shot.shotId}`,
          character: shot.dialogueSnippet.speaker,
          text: shot.dialogueSnippet.line,
          startTime: parentClip.timelineStart + 0.5,
          duration: Math.min(Math.max(1.0, parentClip.duration - 0.8), 4.0),
          volume: 85,
          voiceStyle: 'Grounded Cinematic & Resonant',
          audioUrl: `/assets/audio/dialogue/dlg_${shot.shotId}.wav`,
        });
      }
    }
  });

  // Generate SFX tracks
  const sfxTracks: AudioSFXItem[] = [
    {
      id: 'sfx_intro',
      name: 'Cinematic Sub-Drop & Atmospheric Drone',
      category: 'impact',
      startTime: 0,
      duration: Math.min(8, finalAssembledDuration),
      volume: 70,
      audioUrl: '/assets/audio/sfx/impact.mp3',
    },
    {
      id: 'sfx_foley_ambient',
      name: 'Environmental Foley & Ambient Room Tone',
      category: 'foley',
      startTime: Math.min(finalAssembledDuration * 0.25, 12),
      duration: Math.min(6, finalAssembledDuration * 0.5),
      volume: 60,
      audioUrl: '/assets/audio/sfx/door_whoosh.mp3',
    },
    {
      id: 'sfx_riser_climax',
      name: 'Shepard Tone Harmonic Tension Riser',
      category: 'riser',
      startTime: Math.max(0, finalAssembledDuration * 0.65),
      duration: Math.min(10, finalAssembledDuration * 0.25),
      volume: 75,
      audioUrl: '/assets/audio/sfx/telemetry_beeps.mp3',
    },
  ];

  // Generate Music tracks
  const musicTracks: MusicTrackItem[] = [
    {
      id: 'mus_main',
      title: `${title} (Original Score by M-b Studio AI)`,
      mood: 'Atmospheric Orchestral Synth Hybrid',
      bpm: 86,
      startTime: 0,
      duration: finalAssembledDuration,
      volume: 70,
      audioUrl: '/assets/audio/music/ambient_drone.mp3',
    },
  ];

  // Analyze initial continuity
  const continuityIssues = runContinuityAudit(allClips, allShots);

  // Build Character & Location Profiles for Consistency Workspace
  const resolvedChars =
    config.characters && config.characters.length > 0
      ? config.characters
      : deriveCharactersFromScript(screenplay);
  const resolvedLocs =
    config.locations && config.locations.length > 0
      ? config.locations
      : deriveLocationsFromScript(screenplay);

  const characterProfiles: CharacterProfile[] =
    config.characterProfiles && config.characterProfiles.length > 0
      ? config.characterProfiles
      : resolvedChars.map((c, idx) => ({
          id: `char_${idx + 1}`,
          name: c.name,
          role: idx === 0 ? 'Lead Protagonist' : 'Supporting Role',
          appearance: c.visualNotes,
          costume: c.costume,
          visualNotes: c.visualNotes,
          consistencyPrompt: `${c.name}: ${c.visualNotes}. Wardrobe: ${c.costume}`,
        }));

  const locationProfiles: LocationProfile[] =
    config.locationProfiles && config.locationProfiles.length > 0
      ? config.locationProfiles
      : resolvedLocs.map((l, idx) => ({
          id: `loc_${idx + 1}`,
          name: l.name,
          environmentType: 'Cinema Set',
          lighting: l.lighting,
          colorKey: l.colorKey,
          atmosphere: `${config.visualStyle || 'Cinematic Realism'} atmospheric set`,
        }));

  const storyboardFrames: StoryboardFrame[] = allShots.map((shot, idx) => ({
    frameId: `sb_${shot.shotId}`,
    shotId: shot.shotId,
    sceneId: shot.sceneId,
    frameNumber: idx + 1,
    title: shot.title,
    description: shot.description,
    shotType: shot.shotType,
    cameraAngle: shot.angle,
    cameraMovement: shot.cameraMovement,
    composition: `${shot.shotType}, ${shot.angle}, ${shot.visualContinuity.screenDirection}`,
    lightingNotes: shot.visualContinuity.lightingKey,
    approvalStatus: 'pending',
  }));

  const chosenAspect = config.aspectRatio || '16:9';
  const chosenRes = config.resolution || '1080p';
  const chosenOutLang = config.outputLanguage || config.screenplayLanguage || 'en';

  return {
    id: projectId,
    title: title || 'Untitled AI Masterpiece',
    description: config.description || logline,
    genre: genre || 'Cinematic Drama',
    logline: logline || 'An epic narrative assembled through algorithmic pacing and generative visual harmony.',
    targetDurationSeconds: target,
    actualAssembledDuration: finalAssembledDuration,
    fps: 24,
    aspectRatio: chosenAspect,
    resolution: chosenRes,
    screenplayLanguage: config.screenplayLanguage || 'en',
    outputLanguage: chosenOutLang,
    visualStyle: config.visualStyle || 'Cinematic Realism',
    targetAudience: config.targetAudience || 'General Cinema Audience',
    status: 'in_production',
    breakdownApproved: false,
    storyboardApproved: false,
    screenplayRaw: screenplay,
    acts,
    scenes,
    shots: allShots,
    clips: allClips,
    dialogueTracks,
    sfxTracks,
    musicTracks,
    continuityIssues,
    defaultProvider: provider,
    characters: resolvedChars,
    locations: resolvedLocs,
    characterProfiles,
    locationProfiles,
    storyboardFrames,
    exportSettings: {
      resolution: chosenRes,
      aspectRatio: chosenAspect,
      fps: 24,
      codec: 'H.264',
      burnSubtitles: true,
      subtitleLanguage: chosenOutLang,
      colorGradeLUT: 'Cinematic Teal & Orange',
      audioMix: {
        dialogueLevel: 90,
        musicLevel: 65,
        sfxLevel: 75,
        masterGain: 0,
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * AI Continuity Auditor
 * Inspects consecutive clips and shots for continuity discrepancies
 */
export function runContinuityAudit(clips: VideoClip[], shots: Shot[]): ContinuityIssue[] {
  const issues: ContinuityIssue[] = [];

  for (let i = 0; i < clips.length - 1; i++) {
    const clipA = clips[i];
    const clipB = clips[i + 1];

    const shotA = shots.find((s) => s.shotId === clipA.shotId);
    const shotB = shots.find((s) => s.shotId === clipB.shotId);

    if (!shotA || !shotB) continue;

    // Check 1: Screen Direction Flip (180 degree rule violation)
    if (
      clipA.visualContinuity.screenDirection === 'left-to-right' &&
      clipB.visualContinuity.screenDirection === 'right-to-left' &&
      clipA.sceneId === clipB.sceneId &&
      shotA.shotType !== 'Close-Up' &&
      shotB.shotType !== 'Close-Up'
    ) {
      issues.push({
        id: `cont_dir_${clipA.clipId}_${clipB.clipId}`,
        clipAId: clipA.clipId,
        clipBId: clipB.clipId,
        sceneId: clipA.sceneId,
        shotNumberA: shotA.shotNumber,
        shotNumberB: shotB.shotNumber,
        issueType: 'screen_direction',
        severity: 'medium',
        description: `Axis of Action Violation: Shot ${shotA.shotNumber} tracks Left-to-Right while Shot ${shotB.shotNumber} reverses to Right-to-Left within the same scene.`,
        recommendation: `Align camera tracking vector in Shot ${shotB.shotNumber} to 'left-to-right' or insert a neutral frontal cutaway.`,
        applied: false,
      });
    }

    // Check 2: Time of Day jumps without transition
    if (
      clipA.visualContinuity.timeOfDay !== clipB.visualContinuity.timeOfDay &&
      clipA.sceneId === clipB.sceneId
    ) {
      issues.push({
        id: `cont_tod_${clipA.clipId}_${clipB.clipId}`,
        clipAId: clipA.clipId,
        clipBId: clipB.clipId,
        sceneId: clipA.sceneId,
        shotNumberA: shotA.shotNumber,
        shotNumberB: shotB.shotNumber,
        issueType: 'time_of_day',
        severity: 'high',
        description: `Abrupt Time-of-Day Shift: Scene transitions from ${clipA.visualContinuity.timeOfDay} directly to ${clipB.visualContinuity.timeOfDay} without an optical dissolve.`,
        recommendation: `Apply a 1.2s cross-dissolve transition or align lighting tags in prompt metadata.`,
        applied: false,
      });
    }

    // Check 3: Jump Cut detection (same shot type and angle with no movement)
    if (
      shotA.shotType === shotB.shotType &&
      shotA.cameraMovement === 'Static' &&
      shotB.cameraMovement === 'Static' &&
      shotA.angle === shotB.angle &&
      clipA.sceneId === clipB.sceneId
    ) {
      issues.push({
        id: `cont_jump_${clipA.clipId}_${clipB.clipId}`,
        clipAId: clipA.clipId,
        clipBId: clipB.clipId,
        sceneId: clipA.sceneId,
        shotNumberA: shotA.shotNumber,
        shotNumberB: shotB.shotNumber,
        issueType: 'camera_jump',
        severity: 'low',
        description: `Potential Jump Cut: Consecutive shots both use static ${shotA.shotType} at ${shotA.angle}.`,
        recommendation: `Change Shot ${shotB.shotNumber} camera movement to 'Push In' or vary angle by >= 30 degrees.`,
        applied: false,
      });
    }
  }

  return issues;
}

/**
 * Creates visual cues and color schemes for procedural preview playback
 */
export function generateProceduralVideoPlaceholder(
  clipId: string,
  shotType: string,
  camera: string,
  duration: number,
  mood: string
): string {
  return `procedural://cinema-clip?id=${encodeURIComponent(clipId)}&type=${encodeURIComponent(shotType)}&cam=${encodeURIComponent(camera)}&dur=${duration}&mood=${encodeURIComponent(mood)}`;
}
