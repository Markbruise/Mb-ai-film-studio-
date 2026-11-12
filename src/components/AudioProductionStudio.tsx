import React, { useState, useEffect, useRef } from 'react';
import {
  FilmProject,
  DialogueTrackItem,
  AudioSFXItem,
  MusicTrackItem,
  StudioLanguage,
} from '../types/film';
import { SUPPORTED_LANGUAGES } from '../utils/i18n';
import {
  Mic,
  Music,
  Volume2,
  Play,
  Pause,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  CheckCircle2,
  Sliders,
  Disc,
} from 'lucide-react';

interface AudioProductionStudioProps {
  project: FilmProject;
  onUpdateProject: React.Dispatch<React.SetStateAction<FilmProject>>;
  onOpenMusicComposer: () => void;
}

export const AudioProductionStudio: React.FC<AudioProductionStudioProps> = ({
  project,
  onUpdateProject,
  onOpenMusicComposer,
}) => {
  const [ttsEngine, setTtsEngine] = useState<'auto' | 'gemini-tts' | 'flite'>('auto');
  const [dialogueLang, setDialogueLang] = useState<StudioLanguage>(project.outputLanguage || 'en');
  const [synthesizingId, setSynthesizingId] = useState<string | null>(null);
  const [isBatchTts, setIsBatchTts] = useState(false);
  const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [sfxCatalog, setSfxCatalog] = useState<Array<{ id: string; name: string; audioUrl: string }>>([]);
  const [musicCatalog, setMusicCatalog] = useState<Array<{ id: string; title: string; audioUrl: string; bpm: number }>>([]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch('/api/audio/assets')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.sfx)) setSfxCatalog(data.sfx);
        if (Array.isArray(data.music)) setMusicCatalog(data.music);
      })
      .catch(() => {});
  }, []);

  const togglePlayPreview = (url?: string) => {
    if (!url || !previewAudioRef.current) return;
    if (playingAudioUrl === url && !previewAudioRef.current.paused) {
      previewAudioRef.current.pause();
      setPlayingAudioUrl(null);
    } else {
      previewAudioRef.current.src = url;
      previewAudioRef.current.play().then(() => setPlayingAudioUrl(url)).catch(() => {});
    }
  };

  const handleSynthesizeLine = async (dlg: DialogueTrackItem) => {
    setSynthesizingId(dlg.id);
    setStatusNote(null);
    try {
      const res = await fetch('/api/audio/dialogue/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dialogueId: dlg.id,
          text: dlg.text,
          character: dlg.character,
          voiceStyle: dlg.voiceStyle,
          language: dlg.language || dialogueLang,
          engine: ttsEngine,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Voice synthesis failed');

      onUpdateProject((prev) => ({
        ...prev,
        dialogueTracks: prev.dialogueTracks.map((d) =>
          d.id === dlg.id
            ? {
                ...d,
                audioUrl: `${data.audioUrl}?v=${Date.now()}`,
                duration: data.duration || d.duration,
                language: dlg.language || dialogueLang,
              }
            : d
        ),
        updatedAt: new Date().toISOString(),
      }));
      setStatusNote(`Synthesized voice for ${dlg.character} via ${data.engine} (${data.duration}s).`);
    } catch (err: any) {
      setStatusNote(`Error: ${err?.message || 'Voice synthesis failed'}`);
    } finally {
      setSynthesizingId(null);
    }
  };

  const handleSynthesizeAllDialogue = async () => {
    setIsBatchTts(true);
    for (const dlg of project.dialogueTracks) {
      await handleSynthesizeLine(dlg);
    }
    setIsBatchTts(false);
  };

  const handleAddDialogueLine = () => {
    const firstChar = project.characterProfiles?.[0]?.name || 'Narrator';
    const newItem: DialogueTrackItem = {
      id: `dlg_${Date.now()}`,
      character: firstChar,
      text: 'New spoken dialogue line.',
      startTime: Math.min(project.actualAssembledDuration, project.dialogueTracks.length * 4),
      duration: 3.5,
      volume: 85,
      voiceStyle: 'neutral',
      language: dialogueLang,
    };
    onUpdateProject((prev) => ({
      ...prev,
      dialogueTracks: [...prev.dialogueTracks, newItem],
    }));
  };

  const handleAddSfxFromCatalog = (sfx: { id: string; name: string; audioUrl: string }) => {
    const newSfx: AudioSFXItem = {
      id: `sfx_${Date.now()}`,
      name: sfx.name,
      category: 'foley',
      startTime: 0,
      duration: 4,
      volume: 75,
      audioUrl: sfx.audioUrl,
    };
    onUpdateProject((prev) => ({
      ...prev,
      sfxTracks: [...prev.sfxTracks, newSfx],
    }));
  };

  const handleUseCatalogMusic = (mus: { id: string; title: string; audioUrl: string; bpm: number }) => {
    const newMus: MusicTrackItem = {
      id: `mus_${Date.now()}`,
      title: mus.title,
      mood: 'Cinema Score',
      bpm: mus.bpm,
      startTime: 0,
      duration: project.actualAssembledDuration || 30,
      volume: 70,
      audioUrl: mus.audioUrl,
    };
    onUpdateProject((prev) => ({
      ...prev,
      musicTracks: [newMus],
    }));
    setStatusNote(`Set music score track to "${mus.title}".`);
  };

  return (
    <div className="bg-zinc-950 rounded-2xl border border-zinc-800 p-5 sm:p-6 space-y-6">
      <audio
        ref={previewAudioRef}
        onEnded={() => setPlayingAudioUrl(null)}
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-5 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-amber-400 mb-1">
            <Mic className="w-4 h-4" />
            <span>Stage 7 — Multilingual Voice, Music & SFX Mixing</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Sound & Voice Production Studio</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
            Manage spoken character dialogue in any language, select neural or offline TTS voices, compose background music via Lyria 3, place sound effects, and calibrate final mix levels.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSynthesizeAllDialogue}
            disabled={isBatchTts || project.dialogueTracks.length === 0}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            {isBatchTts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>Synthesize All Dialogue ({project.dialogueTracks.length})</span>
          </button>

          <button
            type="button"
            onClick={onOpenMusicComposer}
            className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-white flex items-center gap-1.5"
          >
            <Disc className="w-4 h-4 text-purple-400" />
            <span>Open Lyria 3 Music Composer</span>
          </button>
        </div>
      </div>

      {statusNote && (
        <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-cyan-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusNote}</span>
        </div>
      )}

      {/* Voice Engine & Language Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-xs">
        <div>
          <label className="text-zinc-400 font-semibold block mb-1.5">Default Voice Language</label>
          <select
            value={dialogueLang}
            onChange={(e) => setDialogueLang(e.target.value as StudioLanguage)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label} ({l.nativeLabel})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-zinc-400 font-semibold block mb-1.5">Speech Synthesis Engine</label>
          <select
            value={ttsEngine}
            onChange={(e) => setTtsEngine(e.target.value as any)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white"
          >
            <option value="auto">Auto (Gemini Neural for Multilingual, Flite for EN)</option>
            <option value="gemini-tts">Gemini 3.8 Neural TTS (Expressive Multilingual)</option>
            <option value="flite">FFmpeg Flite TTS (Zero-Latency Local)</option>
          </select>
        </div>

        <div className="flex flex-col justify-between">
          <span className="text-zinc-400 font-semibold block mb-1.5">Dialogue Cue Management</span>
          <button
            type="button"
            onClick={handleAddDialogueLine}
            className="w-full py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-semibold flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Add Spoken Dialogue Line</span>
          </button>
        </div>
      </div>

      {/* DIALOGUE TRACK LIST */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Mic className="w-4 h-4 text-amber-400" />
          <span>Dialogue Script & Voice Synthesis (Track A1)</span>
        </h3>

        {project.dialogueTracks.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
            No dialogue tracks yet. Click "Add Spoken Dialogue Line" above.
          </div>
        ) : (
          <div className="space-y-2.5">
            {project.dialogueTracks.map((dlg) => {
              const isBusy = synthesizingId === dlg.id;
              const isPlaying = dlg.audioUrl && playingAudioUrl === dlg.audioUrl;
              return (
                <div
                  key={dlg.id}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3.5 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center text-xs"
                >
                  <div className="lg:col-span-2">
                    <input
                      type="text"
                      value={dlg.character}
                      onChange={(e) =>
                        onUpdateProject((prev) => ({
                          ...prev,
                          dialogueTracks: prev.dialogueTracks.map((d) =>
                            d.id === dlg.id ? { ...d, character: e.target.value } : d
                          ),
                        }))
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 font-bold text-amber-300"
                    />
                  </div>

                  <div className="lg:col-span-5">
                    <input
                      type="text"
                      value={dlg.text}
                      onChange={(e) =>
                        onUpdateProject((prev) => ({
                          ...prev,
                          dialogueTracks: prev.dialogueTracks.map((d) =>
                            d.id === dlg.id ? { ...d, text: e.target.value } : d
                          ),
                        }))
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-100"
                    />
                  </div>

                  <div className="lg:col-span-2 flex items-center gap-2">
                    <select
                      value={dlg.voiceStyle === 'female' ? 'female' : 'male'}
                      onChange={(e) =>
                        onUpdateProject((prev) => ({
                          ...prev,
                          dialogueTracks: prev.dialogueTracks.map((d) =>
                            d.id === dlg.id ? { ...d, voiceStyle: e.target.value } : d
                          ),
                        }))
                      }
                      className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-zinc-200"
                    >
                      <option value="female">Female Voice</option>
                      <option value="male">Male Voice</option>
                    </select>
                    <span className="font-mono text-zinc-500 tabular-nums">@{dlg.startTime.toFixed(1)}s</span>
                  </div>

                  <div className="lg:col-span-3 flex items-center justify-end gap-2">
                    {dlg.audioUrl && (
                      <button
                        type="button"
                        onClick={() => togglePlayPreview(dlg.audioUrl)}
                        className="p-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-emerald-400"
                        title="Play synthesized dialogue"
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleSynthesizeLine(dlg)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-semibold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                      <span>Synthesize</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onUpdateProject((prev) => ({
                          ...prev,
                          dialogueTracks: prev.dialogueTracks.filter((d) => d.id !== dlg.id),
                        }))
                      }
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Grid: Music & SFX + Master Audio Mixer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
        {/* Music & SFX */}
        <div className="lg:col-span-7 bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white flex items-center gap-2 text-sm">
              <Music className="w-4 h-4 text-purple-400" />
              <span>Music Score & SFX Tracks</span>
            </h3>
            <span className="font-mono text-zinc-500">
              {project.musicTracks.length} Score • {project.sfxTracks.length} SFX
            </span>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] uppercase font-semibold text-zinc-400">Built-In Film Score Cues</div>
            <div className="flex flex-wrap gap-2">
              {musicCatalog.map((mus) => (
                <button
                  key={mus.id}
                  type="button"
                  onClick={() => handleUseCatalogMusic(mus)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3 text-purple-400" />
                  <span>{mus.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <div className="text-[11px] uppercase font-semibold text-zinc-400">Add Sound Effects (SFX)</div>
            <div className="flex flex-wrap gap-2">
              {sfxCatalog.map((sfx) => (
                <button
                  key={sfx.id}
                  type="button"
                  onClick={() => handleAddSfxFromCatalog(sfx)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 flex items-center gap-1.5"
                >
                  <Volume2 className="w-3 h-3 text-emerald-400" />
                  <span>+ {sfx.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Master Mix Levels */}
        <div className="lg:col-span-5 bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 space-y-4 text-xs">
          <h3 className="font-bold text-white flex items-center gap-2 text-sm">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Master Track Mix Balance</span>
          </h3>

          {[
            { key: 'dialogueLevel' as const, label: 'Dialogue Bus (A1)', accent: 'accent-amber-400' },
            { key: 'musicLevel' as const, label: 'Music Score Bus (A3)', accent: 'accent-purple-400' },
            { key: 'sfxLevel' as const, label: 'SFX & Foley Bus (A2)', accent: 'accent-emerald-400' },
          ].map((bus) => {
            const val = project.exportSettings.audioMix[bus.key];
            return (
              <div key={bus.key} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-300 font-medium">{bus.label}</span>
                  <span className="font-mono text-white font-bold tabular-nums">{val}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={val}
                  onChange={(e) => {
                    const num = parseInt(e.target.value, 10);
                    onUpdateProject((prev) => ({
                      ...prev,
                      exportSettings: {
                        ...prev.exportSettings,
                        audioMix: {
                          ...prev.exportSettings.audioMix,
                          [bus.key]: num,
                        },
                      },
                    }));
                  }}
                  className={`w-full ${bus.accent} cursor-pointer`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
