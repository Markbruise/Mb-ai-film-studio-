import React, { useState, useRef } from 'react';
import {
  FilmProject,
  CharacterProfile,
  LocationProfile,
} from '../types/film';
import {
  Users,
  MapPin,
  Plus,
  Trash2,
  Sparkles,
  Upload,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Lock,
} from 'lucide-react';

interface CharacterLocationStudioProps {
  project: FilmProject;
  onUpdateProject: React.Dispatch<React.SetStateAction<FilmProject>>;
  onProceedToStoryboard: () => void;
}

export const CharacterLocationStudio: React.FC<CharacterLocationStudioProps> = ({
  project,
  onUpdateProject,
  onProceedToStoryboard,
}) => {
  const [subTab, setSubTab] = useState<'characters' | 'locations'>('characters');
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileUploadTarget = useRef<{ type: 'character' | 'location'; id: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const characters: CharacterProfile[] = project.characterProfiles || [];
  const locations: LocationProfile[] = project.locationProfiles || [];

  const updateCharacters = (next: CharacterProfile[]) => {
    onUpdateProject((prev) => ({
      ...prev,
      characterProfiles: next,
      characters: next.map((c) => ({
        name: c.name,
        visualNotes: `${c.appearance} ${c.visualNotes}`.trim(),
        costume: c.costume,
      })),
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateLocations = (next: LocationProfile[]) => {
    onUpdateProject((prev) => ({
      ...prev,
      locationProfiles: next,
      locations: next.map((l) => ({
        name: l.name,
        lighting: l.lighting,
        colorKey: l.colorKey,
      })),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleAddCharacter = () => {
    const newChar: CharacterProfile = {
      id: `char_${Date.now()}`,
      name: `New Character ${characters.length + 1}`,
      role: 'Supporting Cast',
      age: '30s',
      appearance: 'Distinctive natural features, expressive eyes, realistic skin texture.',
      costume: 'Tailored contemporary wardrobe matching scene tone.',
      personality: 'Determined, observant',
      voiceProfile: 'Warm cinematic timbre',
      visualNotes: 'Maintain exact facial likeness and wardrobe consistency across shots.',
    };
    updateCharacters([...characters, newChar]);
  };

  const handleAddLocation = () => {
    const newLoc: LocationProfile = {
      id: `loc_${Date.now()}`,
      name: `Location Set ${locations.length + 1}`,
      environmentType: 'Interior / Exterior Film Set',
      lighting: 'Motivated key light with subtle practical accents and natural shadow rolloff.',
      colorKey: 'Warm amber highlights, deep charcoal shadows',
      atmosphere: `${project.visualStyle || 'Cinematic Realism'} atmosphere`,
    };
    updateLocations([...locations, newLoc]);
  };

  const handleGenerateReferenceImage = async (kind: 'character' | 'location', id: string) => {
    setGeneratingId(id);
    setErrorMsg(null);
    try {
      let prompt = '';
      let aspectRatio = '1:1';
      if (kind === 'character') {
        const ch = characters.find((c) => c.id === id);
        if (!ch) return;
        prompt = `${project.visualStyle || 'Cinematic film'} character reference turnaround portrait of ${ch.name} (${ch.role}, age ${ch.age || 'adult'}). Appearance: ${ch.appearance}. Wardrobe: ${ch.costume}. ${ch.visualNotes}. Crisp 35mm cinema still, consistent neutral studio rim lighting.`;
        aspectRatio = '3:4';
      } else {
        const loc = locations.find((l) => l.id === id);
        if (!loc) return;
        prompt = `${project.visualStyle || 'Cinematic film'} wide establishing location concept still of ${loc.name} (${loc.environmentType}). Lighting: ${loc.lighting}. Color palette: ${loc.colorKey}. Atmosphere: ${loc.atmosphere}. Photorealistic 35mm anamorphic production design still, no text.`;
        aspectRatio = project.aspectRatio === '9:16' ? '9:16' : '16:9';
      }

      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspectRatio, imageSize: '1K' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image generation failed');

      if (kind === 'character') {
        updateCharacters(
          characters.map((c) => (c.id === id ? { ...c, referenceImageUrl: data.imageUrl } : c))
        );
      } else {
        updateLocations(
          locations.map((l) => (l.id === id ? { ...l, referenceImageUrl: data.imageUrl } : l))
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Reference image generation failed');
    } finally {
      setGeneratingId(null);
    }
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = fileUploadTarget.current;
    if (!file || !target) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (target.type === 'character') {
        updateCharacters(
          characters.map((c) => (c.id === target.id ? { ...c, referenceImageUrl: dataUrl } : c))
        );
      } else {
        updateLocations(
          locations.map((l) => (l.id === target.id ? { ...l, referenceImageUrl: dataUrl } : l))
        );
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const charRefCount = characters.filter((c) => Boolean(c.referenceImageUrl)).length;
  const locRefCount = locations.filter((l) => Boolean(l.referenceImageUrl)).length;

  return (
    <div className="bg-zinc-950 rounded-2xl border border-zinc-800 p-5 sm:p-6 space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChosen}
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan-400 mb-1">
            <Lock className="w-3.5 h-3.5" />
            <span>Visual Continuity & Identity Anchor</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Characters & Locations Studio</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
            Define consistent appearances, wardrobe, voice notes, locations, and lighting keys. Reference images created here are injected directly into storyboard frames and video generation requests.
          </p>
        </div>

        <button
          type="button"
          onClick={onProceedToStoryboard}
          className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs flex items-center gap-2 shrink-0 self-start md:self-auto"
        >
          <span>Continue to Storyboard Studio</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs">
          <button
            type="button"
            onClick={() => setSubTab('characters')}
            className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition ${
              subTab === 'characters' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 text-amber-400" />
            <span>Characters ({characters.length})</span>
            <span className="font-mono text-[10px] text-zinc-400">{charRefCount} refs</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('locations')}
            className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition ${
              subTab === 'locations' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <MapPin className="w-4 h-4 text-cyan-400" />
            <span>Locations ({locations.length})</span>
            <span className="font-mono text-[10px] text-zinc-400">{locRefCount} refs</span>
          </button>
        </div>

        <button
          type="button"
          onClick={subTab === 'characters' ? handleAddCharacter : handleAddLocation}
          className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-white flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5 text-amber-400" />
          <span>{subTab === 'characters' ? 'Add Character' : 'Add Location'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* CHARACTERS LIST */}
      {subTab === 'characters' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {characters.map((char) => {
            const isBusy = generatingId === char.id;
            return (
              <div
                key={char.id}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row gap-4"
              >
                {/* Reference Portrait Card */}
                <div className="w-full sm:w-44 shrink-0 space-y-2">
                  <div className="aspect-[3/4] rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center relative">
                    {char.referenceImageUrl ? (
                      <>
                        <img
                          src={char.referenceImageUrl}
                          alt={char.name}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Locked</span>
                        </span>
                      </>
                    ) : (
                      <div className="text-center p-3 text-xs text-zinc-500 space-y-1">
                        <Users className="w-7 h-7 mx-auto text-zinc-700" />
                        <div>No Reference Portrait</div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleGenerateReferenceImage('character', char.id)}
                      className="px-2 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-[11px] font-semibold text-amber-300 flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      <span>AI Ref</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        fileUploadTarget.current = { type: 'character', id: char.id };
                        fileInputRef.current?.click();
                      }}
                      className="px-2 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-semibold text-zinc-300 flex items-center justify-center gap-1"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Upload</span>
                    </button>
                  </div>
                </div>

                {/* Editable Character Attributes */}
                <div className="flex-1 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={char.name}
                      onChange={(e) =>
                        updateCharacters(
                          characters.map((c) => (c.id === char.id ? { ...c, name: e.target.value } : c))
                        )
                      }
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm font-bold text-white"
                      placeholder="Character Name"
                    />
                    <button
                      type="button"
                      onClick={() => updateCharacters(characters.filter((c) => c.id !== char.id))}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40"
                      title="Delete character"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={char.role}
                      onChange={(e) =>
                        updateCharacters(
                          characters.map((c) => (c.id === char.id ? { ...c, role: e.target.value } : c))
                        )
                      }
                      placeholder="Role (Lead / Villain)"
                      className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200"
                    />
                    <input
                      type="text"
                      value={char.voiceProfile || ''}
                      onChange={(e) =>
                        updateCharacters(
                          characters.map((c) => (c.id === char.id ? { ...c, voiceProfile: e.target.value } : c))
                        )
                      }
                      placeholder="Voice Tone"
                      className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold block mb-1">
                      Physical Appearance
                    </label>
                    <textarea
                      rows={2}
                      value={char.appearance}
                      onChange={(e) =>
                        updateCharacters(
                          characters.map((c) => (c.id === char.id ? { ...c, appearance: e.target.value } : c))
                        )
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold block mb-1">
                      Costume & Continuity Wardrobe
                    </label>
                    <textarea
                      rows={2}
                      value={char.costume}
                      onChange={(e) =>
                        updateCharacters(
                          characters.map((c) => (c.id === char.id ? { ...c, costume: e.target.value } : c))
                        )
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LOCATIONS LIST */}
      {subTab === 'locations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {locations.map((loc) => {
            const isBusy = generatingId === loc.id;
            return (
              <div
                key={loc.id}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-3"
              >
                <div className="aspect-video rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center relative">
                  {loc.referenceImageUrl ? (
                    <img src={loc.referenceImageUrl} alt={loc.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center text-xs text-zinc-500 space-y-1">
                      <MapPin className="w-7 h-7 mx-auto text-zinc-700" />
                      <div>No Environment Concept Still</div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={loc.name}
                    onChange={(e) =>
                      updateLocations(locations.map((l) => (l.id === loc.id ? { ...l, name: e.target.value } : l)))
                    }
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm font-bold text-white"
                  />
                  <button
                    type="button"
                    onClick={() => updateLocations(locations.filter((l) => l.id !== loc.id))}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold block mb-1">
                      Lighting Design
                    </label>
                    <textarea
                      rows={2}
                      value={loc.lighting}
                      onChange={(e) =>
                        updateLocations(locations.map((l) => (l.id === loc.id ? { ...l, lighting: e.target.value } : l)))
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase font-semibold block mb-1">
                      Color Key & Mood
                    </label>
                    <textarea
                      rows={2}
                      value={loc.colorKey}
                      onChange={(e) =>
                        updateLocations(locations.map((l) => (l.id === loc.id ? { ...l, colorKey: e.target.value } : l)))
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleGenerateReferenceImage('location', loc.id)}
                    className="flex-1 py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Generate Set Reference (Nano Banana 2.1)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      fileUploadTarget.current = { type: 'location', id: loc.id };
                      fileInputRef.current?.click();
                    }}
                    className="px-3 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
