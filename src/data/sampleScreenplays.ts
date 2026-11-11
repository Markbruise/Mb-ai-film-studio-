export interface SampleScreenplay {
  id: string;
  title: string;
  genre: string;
  logline: string;
  defaultDurationSeconds: number; // e.g. 300s (5m) or 30s
  synopsis: string;
  rawScript: string;
  characters: { name: string; visualNotes: string; costume: string }[];
  locations: { name: string; lighting: string; colorKey: string }[];
}

export const SAMPLE_SCREENPLAYS: SampleScreenplay[] = [
  {
    id: 'script-kepler',
    title: 'Echoes of Kepler',
    genre: 'Sci-Fi Mystery / Space Thriller',
    logline: 'An astrobiologist stranded on an abandoned terraforming platform intercepts a transmission echoing from beneath deep orbital ice.',
    defaultDurationSeconds: 300, // 5 minutes
    synopsis: 'Dr. Elena Vance discovers that the catastrophic failure of the Kepler-186f station was not mechanical, but triggered by an ancient subterranean frequency that has awakened.',
    characters: [
      {
        name: 'Dr. Elena Vance',
        visualNotes: 'Late 30s, intense amber eyes, weathered EVA pressure suit with glowing cyan telemetry harness.',
        costume: 'Titanium-weave flight suit with matte charcoal finish, weathered shoulder patches.'
      },
      {
        name: 'Synthetica AI (A.R.I.A)',
        visualNotes: 'Holographic avatar projected onto frost-glazed cockpit glass, shifting between calm gold and urgent crimson.',
        costume: 'Digital photon refraction.'
      }
    ],
    locations: [
      {
        name: 'Observation Dome - Deck 4',
        lighting: 'Deep cobalt ambient starlight with sharp rim lighting from the icy ring system below.',
        colorKey: 'Deep navy, tungsten cyan, emergency orange accents'
      },
      {
        name: 'Cryo-Vault Sublevel',
        lighting: 'Flickering auxiliary halogen tubes, misty condensation vents.',
        colorKey: 'Industrial emerald green, wet asphalt black'
      },
      {
        name: 'Orbital Platform Exterior Edge',
        lighting: 'High-contrast solar flare over planetary limb, pitch black vacuum shadows.',
        colorKey: 'Specular white, deep abyssal black'
      }
    ],
    rawScript: `SCENE 1 - EXT. ORBITAL PLATFORM - DECK 4 - NIGHT / SPACE
The skeletal spire of Kepler-186 Station hangs over a frozen world. Giant planetary rings slice the blackness like spun glass.
Elena steps onto the gantry. Her boots magnetically lock with a dull thud.

ELENA
A.R.I.A, confirm orbital decay rate.

A.R.I.A (V.O.)
Nine minutes until atmospheric entry, Doctor. And the telemetry beacon is pulsing from the deep crust.

SCENE 2 - INT. AIRLOCK CORRIDOR - CONTINUOUS
Steam vents hiss as pressure equalizes. Elena strips off her frost-caked helmet. Her breath plumps in the frigid air.
She taps a handheld spectrograph. The waveform matches nothing on known astronomical databases.

ELENA
That's not natural seismic echo. It's harmonic. It has syntax.

SCENE 3 - INT. MAIN MAINFRAME CRYPT - MOMENTS LATER
Banks of cryogenic processing towers glow like monoliths. Frost cascades down glass conduits.
In the center, a crystalline monolith vibrates. Fine ripples form on Elena's visor.

A.R.I.A (V.O.)
It's responding to your biometric frequency.

Elena reaches out a gloved hand. Just before contact, the audio spikes into a resonant chord.

SCENE 4 - EXT. PLATFORM EXTERIOR - HIGH ANGLE
The ice below fractures in concentric luminescent circles. Beams of sapphire light spear through the cloud tops.

ELENA
It wasn't a distress call. It was an awakening.

FADE OUT.`
  },
  {
    id: 'script-neon-requiem',
    title: 'Neon Requiem',
    genre: 'Cyberpunk Noir / Action',
    logline: 'A retired memory retrieval operative is hired to locate a stolen synthetic consciousness before midnight in rain-soaked Neo-Shinjuku.',
    defaultDurationSeconds: 60, // 1 minute fast teaser
    synopsis: 'Detective Kael Vance tracks a rogue memory shard through vertical alleyways, confronting the megacorp enforcers hunting him down.',
    characters: [
      {
        name: 'Kael Vance',
        visualNotes: 'Trenchcoat with fiber-optic stitching, chrome cybernetic prosthetic left arm, scarred jawline.',
        costume: 'Dark distressed ballistic leather duster, rain-spattered neon reflections.'
      },
      {
        name: 'Nyx',
        visualNotes: 'Holographic informant with iridescent violet hair, augmented retinal optics.',
        costume: 'Translucent vinyl jacket, chrome chokers.'
      }
    ],
    locations: [
      {
        name: 'Neo-Shinjuku Alley 42',
        lighting: 'Flickering magenta neon signs, rain puddle reflections, headlight sweeps.',
        colorKey: 'Cyber magenta, electric cyan, wet asphalt'
      },
      {
        name: 'Rooftop Helipad',
        lighting: 'Sweeping searchlights from corporate gunships through heavy rain.',
        colorKey: 'Monochrome slate blue with searing white floodlights'
      }
    ],
    rawScript: `SCENE 1 - EXT. NEO-SHINJUKU ALLEY - NIGHT
Heavy acid rain pours over towering holographic billboards. Steam rises from sewer gratings.
Kael stands under a dripping awning, lighting an electric cigarette with his sparked cybernetic fingers.

NYX (V.O.)
They know you have the core, Kael. The Syndicate deployed their black drones.

SCENE 2 - EXT. ROOFTOP HELIPAD - NIGHT
A corporate hover-gunship drops out of the low cloud ceiling. Red laser target locks track across the wet concrete.
Kael runs along the edge, leapfrogging the exhaust vents.

KAEL
Tell them if they want the memories, they'll have to pull them from the ashes!

He dives into the neon abyss as the gunship unleashes twin tracer rounds.`
  },
  {
    id: 'script-lighthouse',
    title: 'The Last Keeper',
    genre: 'Atmospheric Drama / Mystery',
    logline: 'On a jagged North Atlantic headland, an isolated lighthouse keeper notices the rotating beacon beam has begun casting shadows of things that are not there.',
    defaultDurationSeconds: 120, // 2 minutes
    synopsis: 'Arthur has kept the lantern burning for forty years through gale-force nor\'easters. Tonight, the beam reveals a phantom vessel emerging from the breakers.',
    characters: [
      {
        name: 'Arthur Pendelton',
        visualNotes: 'Weather-beaten 60s, silver beard, oilskin waterproofs, piercing grey eyes.',
        costume: 'Heavy cable-knit navy sweater, salt-stained oilskin yellow slicker.'
      }
    ],
    locations: [
      {
        name: 'Lantern Room - High Perch',
        lighting: 'Sweeping 1000W Fresnel brass beam rotating continuously through sea fog.',
        colorKey: 'Warm brass amber, ocean slate, foggy seafoam'
      },
      {
        name: 'Rocky Headland Shoreline',
        lighting: 'Crashing bioluminescent breakers under moonlight, gale winds.',
        colorKey: 'Deep navy, frothing white foam, jagged wet granite'
      }
    ],
    rawScript: `SCENE 1 - INT. LANTERN ROOM - DUSK
The massive brass clockwork gears turn with a rhythmic, hypnotic ticking.
Arthur winds the counterweight winch. Wind rattles the 180-year-old curved storm panes.

SCENE 2 - EXT. LIGHTHOUSE BALCONY - NIGHT
The beam cuts through impenetrable North Atlantic squalls.
Arthur steps onto the metal catwalk with binoculars. Down in the reef, where only granite teeth await, the lantern beam sweeps over sails that glow beneath the surf.

ARTHUR
Lord preserve what the deep returns.`
  },
  {
    id: 'script-micro-teaser',
    title: 'Solar Flare (Micro-Teaser)',
    genre: 'Cinematic Teaser',
    logline: 'A 10-second adrenaline teaser of a solar probe executing a coronal mass ejection flyby.',
    defaultDurationSeconds: 10,
    synopsis: 'A high-impact, rapid shot sequence showcasing planetary-scale VFX and sound design.',
    characters: [{ name: 'Probe Icarus-9', visualNotes: 'Gold-foil thermal shielding and solar sail mast.', costume: 'Aerospace ceramic' }],
    locations: [{ name: 'Sun Coronal Sphere', lighting: 'Blinding thermonuclear golden plasma loops.', colorKey: 'Solar gold, incandescent white, corona violet' }],
    rawScript: `SCENE 1 - EXT. SOLAR CORONA
A probe skimms over boiling arches of solar prominence. Shields flare into blazing white heat as telemetry alarms squeal.`
  }
];
