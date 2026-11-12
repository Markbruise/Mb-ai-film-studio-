import React, { useState, useEffect, useRef } from 'react';
import { SAMPLE_SCREENPLAYS, SampleScreenplay } from '../data/sampleScreenplays';
import {
  FilmProject,
  ProviderId,
  PROVIDER_SPECS,
  StudioLanguage,
} from '../types/film';
import { formatDurationNice, formatSMPTETimecode } from '../utils/timecode';
import {
  deriveCharactersFromScript,
  deriveLocationsFromScript,
  parseScreenplayScenes,
} from '../utils/filmBreakdownEngine';
import { SUPPORTED_LANGUAGES } from '../utils/i18n';
import {
  Sparkles,
  Clock,
  FileText,
  Video,
  CheckCircle,
  ArrowRight,
  Upload,
  Wand2,
  Languages,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface ScreenplayStudioProps {
  activeProject?: FilmProject;
  currentDurationSeconds: number;
  currentProvider: ProviderId;
  onApplyBreakdown: (params: {
    screenplay: string;
    title: string;
    genre: string;
    logline: string;
    targetDurationSeconds: number;
    provider: ProviderId;
    screenplayLanguage?: StudioLanguage;
    outputLanguage?: StudioLanguage;
    characters?: { name: string; visualNotes: string; costume: string }[];
    locations?: { name: string; lighting: string; colorKey: string }[];
  }) => Promise<void>;
  isProcessing: boolean;
}

const DURATION_PRESETS = [
  { label: '10s Micro-Teaser', seconds: 10 },
  { label: '30s Commercial', seconds: 30 },
  { label: '60s Teaser', seconds: 60 },
  { label: '2.5m Trailer', seconds: 150 },
  { label: '5m Short Film', seconds: 300 },
  { label: '10m Narrative', seconds: 600 },
  { label: '20m Episode', seconds: 1200 },
  { label: '60m Television', seconds: 3600 },
  { label: '120m Feature Film', seconds: 7200 },
];

export const ScreenplayStudio: React.FC<ScreenplayStudioProps> = ({
  activeProject,
  currentDurationSeconds,
  currentProvider,
  onApplyBreakdown,
  isProcessing,
}) => {
  const [selectedScriptId, setSelectedScriptId] = useState<string>('');
  const [scriptText, setScriptText] = useState<string>(
    activeProject?.screenplayRaw || SAMPLE_SCREENPLAYS[0].rawScript
  );
  const [projectTitle, setProjectTitle] = useState<string>(
    activeProject?.title || SAMPLE_SCREENPLAYS[0].title
  );
  const [genre, setGenre] = useState<string>(activeProject?.genre || SAMPLE_SCREENPLAYS[0].genre);
  const [logline, setLogline] = useState<string>(
    activeProject?.logline || SAMPLE_SCREENPLAYS[0].logline
  );
  const [targetDuration, setTargetDuration] = useState<number>(
    activeProject?.targetDurationSeconds || currentDurationSeconds || 300
  );
  const [provider, setProvider] = useState<ProviderId>(
    activeProject?.defaultProvider || currentProvider || 'gemini-omni'
  );
  const [screenplayLanguage, setScreenplayLanguage] = useState<StudioLanguage>(
    activeProject?.screenplayLanguage || 'en'
  );
  const [outputLanguage, setOutputLanguage] = useState<StudioLanguage>(
    activeProject?.outputLanguage || 'en'
  );

  // AI Script Tools State
  const [aiIdeaInput, setAiIdeaInput] = useState<string>('');
  const [rewriteNote, setRewriteNote] = useState<string>(
    'Sharpen dramatic stakes, enrich visual action descriptions, and tighten dialogue.'
  );
  const [translateTargetLang, setTranslateTargetLang] = useState<StudioLanguage>('fr');
  const [aiToolBusy, setAiToolBusy] = useState<'generate' | 'rewrite' | 'translate' | null>(null);
  const [aiToolMsg, setAiToolMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // Sync form when user switches projects
  useEffect(() => {
    if (!activeProject) return;
    setScriptText(activeProject.screenplayRaw || '');
    setProjectTitle(activeProject.title || 'Untitled Film');
    setGenre(activeProject.genre || 'Cinematic Drama');
    setLogline(activeProject.logline || '');
    setTargetDuration(activeProject.targetDurationSeconds || 60);
    setProvider(activeProject.defaultProvider || 'gemini-omni');
    setScreenplayLanguage(activeProject.screenplayLanguage || 'en');
    setOutputLanguage(activeProject.outputLanguage || 'en');
  }, [activeProject?.id]);

  const handleSelectSample = (sample: SampleScreenplay) => {
    setSelectedScriptId(sample.id);
    setScriptText(sample.rawScript);
    setProjectTitle(sample.title);
    setGenre(sample.genre);
    setLogline(sample.logline);
    setTargetDuration(sample.defaultDurationSeconds);
  };

  const handleUploadScriptFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      if (content.trim()) {
        setScriptText(content);
        if (!projectTitle.trim()) {
          setProjectTitle(file.name.replace(/\.[^.]+$/, ''));
        }
        setAiToolMsg({ type: 'ok', text: `Loaded screenplay file "${file.name}".` });
      }
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleAiGenerateScript = async () => {
    const premise = aiIdeaInput.trim() || logline.trim() || projectTitle.trim();
    if (!premise) {
      setAiToolMsg({ type: 'err', text: 'Enter a film idea or logline to generate a screenplay.' });
      return;
    }
    setAiToolBusy('generate');
    setAiToolMsg(null);
    try {
      const res = await fetch('/api/ai/screenplay/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea: premise,
          title: projectTitle,
          genre,
          targetDurationSeconds: targetDuration,
          language: screenplayLanguage,
          visualStyle: activeProject?.visualStyle || 'Cinematic Realism',
          targetAudience: activeProject?.targetAudience || 'General Audience',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Screenplay generation failed');
      setScriptText(data.screenplay);
      setAiToolMsg({ type: 'ok', text: `Generated screenplay using ${data.model}.` });
    } catch (err: any) {
      setAiToolMsg({ type: 'err', text: err?.message || 'Screenplay generation failed' });
    } finally {
      setAiToolBusy(null);
    }
  };

  const handleAiRewriteScript = async () => {
    if (!scriptText.trim()) return;
    setAiToolBusy('rewrite');
    setAiToolMsg(null);
    try {
      const res = await fetch('/api/ai/screenplay/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenplay: scriptText,
          instruction: rewriteNote,
          language: screenplayLanguage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rewrite failed');
      setScriptText(data.screenplay);
      setAiToolMsg({ type: 'ok', text: `Screenplay improved using ${data.model}.` });
    } catch (err: any) {
      setAiToolMsg({ type: 'err', text: err?.message || 'Rewrite failed' });
    } finally {
      setAiToolBusy(null);
    }
  };

  const handleAiTranslateScript = async () => {
    if (!scriptText.trim()) return;
    setAiToolBusy('translate');
    setAiToolMsg(null);
    try {
      const res = await fetch('/api/ai/screenplay/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenplay: scriptText,
          targetLanguage: translateTargetLang,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Translation failed');
      setScriptText(data.screenplay);
      setScreenplayLanguage(translateTargetLang);
      setAiToolMsg({ type: 'ok', text: `Translated screenplay cleanly using ${data.model}.` });
    } catch (err: any) {
      setAiToolMsg({ type: 'err', text: err?.message || 'Translation failed' });
    } finally {
      setAiToolBusy(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const matchedSample = SAMPLE_SCREENPLAYS.find((s) => s.id === selectedScriptId);
    const isOriginalSample =
      matchedSample && scriptText.trim() === matchedSample.rawScript.trim();

    const charactersToUse = isOriginalSample
      ? matchedSample.characters
      : deriveCharactersFromScript(scriptText, projectTitle);
    const locationsToUse = isOriginalSample
      ? matchedSample.locations
      : deriveLocationsFromScript(scriptText);

    await onApplyBreakdown({
      screenplay: scriptText,
      title: projectTitle,
      genre,
      logline,
      targetDurationSeconds: targetDuration,
      provider,
      screenplayLanguage,
      outputLanguage,
      characters: charactersToUse,
      locations: locationsToUse,
    });
  };

  const selectedProviderSpec = PROVIDER_SPECS[provider];
  const detectedScenes = parseScreenplayScenes(scriptText, genre);
  const detectedCharacters = deriveCharactersFromScript(scriptText, 'Protagonist');

  return (
    <div className="bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl p-5 sm:p-6 text-zinc-100">
      <input
        ref={uploadInputRef}
        type="file"
        accept=".txt,.fountain,.md,text/plain"
        onChange={handleUploadScriptFile}
        className="hidden"
      />

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-zinc-800 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 uppercase tracking-widest mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Stage 1 — Screenplay & Film Configuration</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Script Studio</h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
              Write, upload, generate, rewrite, or translate your screenplay in any studio language, set film runtime (4s to 120m), and trigger AI scene & shot breakdown.
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center space-x-4 shrink-0">
            <div className="w-11 h-11 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-400 uppercase">Target Runtime</div>
              <div className="text-xl font-bold font-mono text-cyan-300 tabular-nums">
                {formatSMPTETimecode(targetDuration)}
              </div>
              <div className="text-xs text-zinc-400 tabular-nums">
                {formatDurationNice(targetDuration)} ({targetDuration}s)
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Duration & Language Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-zinc-900/50 p-4 sm:p-5 rounded-xl border border-zinc-800">
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span>Target Duration (4s – 120m)</span>
                </span>
                <input
                  type="number"
                  min={4}
                  max={7200}
                  value={targetDuration}
                  onChange={(e) =>
                    setTargetDuration(Math.max(4, Math.min(7200, parseInt(e.target.value, 10) || 4)))
                  }
                  className="w-24 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-right font-mono text-cyan-300"
                />
              </div>

              <input
                type="range"
                min={4}
                max={7200}
                step={targetDuration > 300 ? 30 : targetDuration > 60 ? 5 : 1}
                value={targetDuration}
                onChange={(e) => setTargetDuration(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />

              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.seconds}
                    onClick={() => setTargetDuration(preset.seconds)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                      targetDuration === preset.seconds
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-zinc-400 font-medium block mb-1">Screenplay Language</label>
                <select
                  value={screenplayLanguage}
                  onChange={(e) => setScreenplayLanguage(e.target.value as StudioLanguage)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-white"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label} ({l.nativeLabel})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-zinc-400 font-medium block mb-1">Output / Dialogue Language</label>
                <select
                  value={outputLanguage}
                  onChange={(e) => setOutputLanguage(e.target.value as StudioLanguage)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-white"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label} ({l.nativeLabel})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-zinc-400 font-medium block mb-1">Default Video Engine</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as ProviderId)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-white"
                >
                  {(Object.keys(PROVIDER_SPECS) as ProviderId[]).map((pid) => (
                    <option key={pid} value={pid}>
                      {PROVIDER_SPECS[pid].name} (Max {PROVIDER_SPECS[pid].maxClipDuration}s/clip)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Screenplay AI Co-Writer Toolbar */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Wand2 className="w-4 h-4 text-amber-400" />
                <span>AI Screenplay Co-Writer & Translator</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Upload Script (.txt/.fountain)</span>
                </button>
                {SAMPLE_SCREENPLAYS.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => handleSelectSample(s)}
                    className={`px-2.5 py-1.5 rounded-lg border transition ${
                      selectedScriptId === s.id
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                    }`}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            </div>

            {aiToolMsg && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  aiToolMsg.type === 'ok'
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}
              >
                {aiToolMsg.type === 'ok' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{aiToolMsg.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
              {/* Tool 1: Generate */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
                <div className="font-semibold text-zinc-200">Generate Script from Idea</div>
                <input
                  type="text"
                  value={aiIdeaInput}
                  onChange={(e) => setAiIdeaInput(e.target.value)}
                  placeholder="Or uses Film Logline above..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white"
                />
                <button
                  type="button"
                  disabled={aiToolBusy !== null}
                  onClick={handleAiGenerateScript}
                  className="w-full py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {aiToolBusy === 'generate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Generate Screenplay</span>
                </button>
              </div>

              {/* Tool 2: Rewrite */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
                <div className="font-semibold text-zinc-200">Rewrite & Improve Script</div>
                <input
                  type="text"
                  value={rewriteNote}
                  onChange={(e) => setRewriteNote(e.target.value)}
                  placeholder="Director notes..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white"
                />
                <button
                  type="button"
                  disabled={aiToolBusy !== null}
                  onClick={handleAiRewriteScript}
                  className="w-full py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {aiToolBusy === 'rewrite' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  <span>Rewrite & Polish</span>
                </button>
              </div>

              {/* Tool 3: Translate */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
                <div className="font-semibold text-zinc-200">Translate Screenplay</div>
                <select
                  value={translateTargetLang}
                  onChange={(e) => setTranslateTargetLang(e.target.value as StudioLanguage)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      Translate to {l.label} ({l.nativeLabel})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={aiToolBusy !== null}
                  onClick={handleAiTranslateScript}
                  className="w-full py-2 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 text-indigo-300 font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {aiToolBusy === 'translate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                  <span>Translate Script</span>
                </button>
              </div>
            </div>
          </div>

          {/* Screenplay Workspace Grid: Editor + Live Script Parser */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 space-y-4 bg-zinc-900/40 p-4 sm:p-5 rounded-xl border border-zinc-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 font-medium block mb-1">Film Title</label>
                  <input
                    type="text"
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 font-medium block mb-1">Genre</label>
                  <input
                    type="text"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400 font-medium block mb-1">Logline / Synopsis</label>
                <input
                  type="text"
                  value={logline}
                  onChange={(e) => setLogline(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 font-medium flex items-center justify-between mb-1">
                  <span>Screenplay Manuscript (SCENE / INT. / EXT. / Dialogue)</span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {scriptText.split(/\s+/).filter(Boolean).length} words
                  </span>
                </label>
                <textarea
                  rows={14}
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  placeholder="SCENE 1 - INT. LOCATION - NIGHT..."
                  style={{ fontFamily: 'var(--font-script)' }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500 leading-relaxed"
                />
              </div>
            </div>

            {/* Live Parsed Characters & Scenes Sidebar */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center justify-between">
                  <span>Detected Scenes</span>
                  <span className="font-mono text-cyan-400">{detectedScenes.length}</span>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {detectedScenes.length === 0 ? (
                    <div className="text-xs text-zinc-500">
                      Add INT. or EXT. scene headings so scenes can be mapped individually.
                    </div>
                  ) : (
                    detectedScenes.map((sc, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs space-y-1">
                        <div className="font-bold text-white truncate">
                          {i + 1}. {sc.heading}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          {sc.location} • {sc.timeOfDay} • {sc.dialogueSamples.length} dialogue cue(s)
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center justify-between">
                  <span>Speaking Characters</span>
                  <span className="font-mono text-amber-400">{detectedCharacters.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {detectedCharacters.map((c) => (
                    <span
                      key={c.name}
                      className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-medium"
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  After running Breakdown, refine visual appearance, costumes & voice casting in Characters & Locations Studio.
                </p>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-zinc-800">
            <div className="text-xs text-zinc-400 tabular-nums">
              Target: <span className="text-cyan-400 font-mono font-bold">{formatDurationNice(targetDuration)}</span> • Engine:{' '}
              <span className="text-white font-medium">{selectedProviderSpec.name}</span>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="min-h-[46px] flex items-center justify-center space-x-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm shadow-lg transition disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing Screenplay & Planning Scenes...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Analyze Screenplay & Open Scene Breakdown</span>
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
