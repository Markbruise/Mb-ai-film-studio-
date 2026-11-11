import React, { useState } from 'react';
import { SAMPLE_SCREENPLAYS, SampleScreenplay } from '../data/sampleScreenplays';
import { ProviderId, PROVIDER_SPECS } from '../types/film';
import { formatDurationNice, formatSMPTETimecode } from '../utils/timecode';
import {
  deriveCharactersFromScript,
  deriveLocationsFromScript,
} from '../utils/filmBreakdownEngine';
import {
  Film,
  Sparkles,
  Sliders,
  Layers,
  Clock,
  Play,
  FileText,
  Video,
  CheckCircle,
  Cpu,
  ArrowRight,
} from 'lucide-react';

interface ScreenplayStudioProps {
  currentDurationSeconds: number;
  currentProvider: ProviderId;
  onApplyBreakdown: (params: {
    screenplay: string;
    title: string;
    genre: string;
    logline: string;
    targetDurationSeconds: number;
    provider: ProviderId;
    characters?: { name: string; visualNotes: string; costume: string }[];
    locations?: { name: string; lighting: string; colorKey: string }[];
  }) => Promise<void>;
  isProcessing: boolean;
}

const DURATION_PRESETS = [
  { label: '10s Micro-Teaser', seconds: 10, category: 'Short Form' },
  { label: '30s Commercial', seconds: 30, category: 'Short Form' },
  { label: '60s Teaser', seconds: 60, category: 'Social / Reel' },
  { label: '2.5m Trailer', seconds: 150, category: 'Cinema' },
  { label: '5m Short Film', seconds: 300, category: 'Festival Short' },
  { label: '10m Narrative', seconds: 600, category: 'Festival Short' },
  { label: '20m Episode', seconds: 1200, category: 'Streaming / Series' },
  { label: '60m Television', seconds: 3600, category: 'Broadcast' },
  { label: '120m Feature Film', seconds: 7200, category: 'Cinema Feature' },
];

export const ScreenplayStudio: React.FC<ScreenplayStudioProps> = ({
  currentDurationSeconds,
  currentProvider,
  onApplyBreakdown,
  isProcessing,
}) => {
  const [selectedScript, setSelectedScript] = useState<SampleScreenplay>(SAMPLE_SCREENPLAYS[0]);
  const [scriptText, setScriptText] = useState<string>(SAMPLE_SCREENPLAYS[0].rawScript);
  const [projectTitle, setProjectTitle] = useState<string>(SAMPLE_SCREENPLAYS[0].title);
  const [genre, setGenre] = useState<string>(SAMPLE_SCREENPLAYS[0].genre);
  const [logline, setLogline] = useState<string>(SAMPLE_SCREENPLAYS[0].logline);

  // Target duration state (between 4s and 7200s)
  const [targetDuration, setTargetDuration] = useState<number>(currentDurationSeconds || 300);
  const [durationInputMode, setDurationInputMode] = useState<'seconds' | 'minutes' | 'hours'>('minutes');
  const [provider, setProvider] = useState<ProviderId>(currentProvider || 'gemini-omni');

  const handleSelectSample = (sample: SampleScreenplay) => {
    setSelectedScript(sample);
    setScriptText(sample.rawScript);
    setProjectTitle(sample.title);
    setGenre(sample.genre);
    setLogline(sample.logline);
    setTargetDuration(sample.defaultDurationSeconds);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If script text matches the loaded sample, use its curated characters/locations;
    // Otherwise, parse characters and locations from custom screenplay
    const isOriginalSample = scriptText.trim() === selectedScript.rawScript.trim();
    const charactersToUse = isOriginalSample
      ? selectedScript.characters
      : deriveCharactersFromScript(scriptText, projectTitle);
    const locationsToUse = isOriginalSample
      ? selectedScript.locations
      : deriveLocationsFromScript(scriptText);

    await onApplyBreakdown({
      screenplay: scriptText,
      title: projectTitle,
      genre,
      logline,
      targetDurationSeconds: targetDuration,
      provider,
      characters: charactersToUse,
      locations: locationsToUse,
    });
  };

  const selectedProviderSpec = PROVIDER_SPECS[provider];

  // Duration input conversion
  const durationInMinutes = Math.round((targetDuration / 60) * 10) / 10;
  const durationInHours = Math.round((targetDuration / 3600) * 100) / 100;

  return (
    <div className="bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl p-6 text-zinc-100">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Step 1: Automatic Film Breakdown & Configuration</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Film Duration & Screenplay Studio
            </h1>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              Set your target film duration from <strong>4 seconds to 120 minutes</strong>. The AI director analyzes the screenplay, calculates act/scene/shot durations, subdivides shots according to provider limits, and automatically assembles the timeline.
            </p>
          </div>

          {/* Target Duration Readout Card */}
          <div className="bg-zinc-900 border border-zinc-700/80 rounded-xl p-4 flex items-center space-x-4 shrink-0 shadow-lg">
            <div className="w-12 h-12 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-400 uppercase">Target Duration</div>
              <div className="text-2xl font-bold font-mono text-cyan-300">
                {formatSMPTETimecode(targetDuration)}
              </div>
              <div className="text-xs text-zinc-400 font-sans">
                {formatDurationNice(targetDuration)} ({targetDuration}s)
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1: Target Duration Selector */}
          <div className="space-y-4 bg-zinc-900/60 p-5 rounded-xl border border-zinc-800/80">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-zinc-200 flex items-center space-x-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>Target Film Duration (4 seconds – 120 minutes)</span>
              </label>

              {/* Input mode switcher */}
              <div className="flex rounded-lg bg-zinc-950 p-0.5 border border-zinc-800 text-xs">
                {(['seconds', 'minutes', 'hours'] as const).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    onClick={() => setDurationInputMode(mode)}
                    className={`px-2.5 py-1 rounded font-medium capitalize transition ${
                      durationInputMode === mode ? 'bg-zinc-800 text-white shadow-xs' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration Slider */}
            <div className="space-y-2">
              <input
                type="range"
                min={4}
                max={7200}
                step={targetDuration > 300 ? 30 : targetDuration > 60 ? 5 : 1}
                value={targetDuration}
                onChange={(e) => setTargetDuration(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex justify-between text-[11px] font-mono text-zinc-500">
                <span>4s (Micro)</span>
                <span>60s (1m)</span>
                <span>300s (5m)</span>
                <span>1200s (20m)</span>
                <span>3600s (1h)</span>
                <span>7200s (2h Feature)</span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-2 pt-2">
              {DURATION_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.seconds}
                  onClick={() => setTargetDuration(preset.seconds)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    targetDuration === preset.seconds
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-xs'
                      : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: AI Video Provider Selection with Duration Limit Rules */}
          <div className="space-y-3 bg-zinc-900/60 p-5 rounded-xl border border-zinc-800/80">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-zinc-200 flex items-center space-x-2">
                <Video className="w-4 h-4 text-purple-400" />
                <span>AI Video Provider & Clip Duration Limit Compliance</span>
              </label>
              <span className="text-xs text-zinc-400">
                Max clip duration: <strong className="text-cyan-400">{selectedProviderSpec.maxClipDuration}s</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(Object.keys(PROVIDER_SPECS) as ProviderId[]).map((pid) => {
                const spec = PROVIDER_SPECS[pid];
                const isSelected = provider === pid;
                return (
                  <div
                    key={pid}
                    onClick={() => setProvider(pid)}
                    className={`cursor-pointer rounded-xl p-3.5 border transition-all ${
                      isSelected
                        ? 'bg-zinc-900 border-cyan-500 ring-1 ring-cyan-500/50 shadow-md'
                        : 'bg-zinc-950/80 hover:bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-white">{spec.name}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${spec.badgeColor}`}>
                        Max {spec.maxClipDuration}s
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed mb-2">
                      {spec.tagline}
                    </p>
                    <div className="flex items-center space-x-3 text-[11px] text-zinc-500">
                      <span>Res: {spec.supportedResolutions.join(', ')}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-zinc-400 bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex items-start space-x-2.5">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Automatic Shot Sub-Division Active:</strong> Any shot longer than{' '}
                {selectedProviderSpec.maxClipDuration}s will automatically be split into seamless{' '}
                {selectedProviderSpec.maxClipDuration}s segments with motion continuity prompt chaining.
              </span>
            </div>
          </div>

          {/* Section 3: Screenplay Selection & Text Editor */}
          <div className="space-y-4 bg-zinc-900/60 p-5 rounded-xl border border-zinc-800/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-sm font-semibold text-zinc-200 flex items-center space-x-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Screenplay & Story Script</span>
              </label>

              {/* Sample script buttons */}
              <div className="flex items-center space-x-1.5 overflow-x-auto text-xs">
                <span className="text-zinc-500 text-[11px] mr-1">Load Preset:</span>
                {SAMPLE_SCREENPLAYS.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => handleSelectSample(s)}
                    className={`px-2.5 py-1 rounded border transition ${
                      selectedScript.id === s.id
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Title & Genre Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-zinc-400 font-medium block mb-1">Film Title</label>
                <input
                  type="text"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 font-medium block mb-1">Genre</label>
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-400 font-medium block mb-1">Logline / Synopsis</label>
              <input
                type="text"
                value={logline}
                onChange={(e) => setLogline(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition"
              />
            </div>

            {/* Screenplay Content */}
            <div>
              <label className="text-xs text-zinc-400 font-medium block mb-1">
                Screenplay Text (Scene headings, action, dialogue)
              </label>
              <textarea
                rows={8}
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder="INT. / EXT. SCENE 1..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-200 font-mono focus:outline-none focus:border-cyan-500 transition leading-relaxed"
              />
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
            <div className="text-xs text-zinc-400">
              Target: <span className="text-cyan-400 font-mono font-bold">{formatDurationNice(targetDuration)}</span> ({targetDuration}s) | Provider: <span className="text-white font-medium">{selectedProviderSpec.name}</span>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white font-semibold text-sm shadow-xl shadow-indigo-950/40 transition active:scale-95 disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Analyzing Screenplay & Generating Clips...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Breakdown Screenplay & Assemble Timeline</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
