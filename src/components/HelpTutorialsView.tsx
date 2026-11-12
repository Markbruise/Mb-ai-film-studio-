import React from 'react';
import {
  HelpCircle,
  Film,
  FileText,
  Layers,
  Users,
  Image as ImageIcon,
  Cpu,
  Lock,
  Volume2,
  Download,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface HelpTutorialsViewProps {
  onStartWorkflow: () => void;
}

export const HelpTutorialsView: React.FC<HelpTutorialsViewProps> = ({ onStartWorkflow }) => {
  const steps = [
    {
      num: '01',
      title: 'Start New Film & Screenplay Studio',
      icon: FileText,
      summary:
        'Choose a duration from 4 seconds up to 120 minutes, pick your aspect ratio (16:9, 9:16, 1:1, or 2.39:1), write or upload a script, or generate/rewrite/translate a screenplay using Gemini.',
    },
    {
      num: '02',
      title: 'Scene Breakdown & Duration Calibration',
      icon: Layers,
      summary:
        'Review automatically segmented acts, scenes, and camera shots matched to your target runtime. Approve the breakdown before locking your cast.',
    },
    {
      num: '03',
      title: 'Character & Location Consistency Studio',
      icon: Users,
      summary:
        'Generate visual character sheets and location lighting plates using Gemini Nano Banana 2.1, or upload custom reference portraits so every shot preserves faces and wardrobe.',
    },
    {
      num: '04',
      title: 'Storyboard Approval Gate',
      icon: ImageIcon,
      summary:
        'Preview and edit camera composition, angles, and lighting per shot. Approve all storyboard frames to authorize batch AI video generation.',
    },
    {
      num: '05',
      title: 'AI Video Production Center & Strict Timeline Gate',
      icon: Cpu,
      summary:
        'Generate clips with Gemini Omni Flash (or Veo 3.1/2 on Vertex AI) in Text-to-Video, Image-to-Video, or Keyframe mode—or upload real MP4 footage per shot. The Timeline Editor unlocks once every shot holds a verified playable MP4.',
    },
    {
      num: '06',
      title: 'Multi-Track Timeline, Sound & Master MP4 Export',
      icon: Download,
      summary:
        'Trim clips frame-by-frame, split shots, configure cross-fades and wipes, synthesize multilingual dialogue + Lyria 3 music + foley, and export a verified H.264/AAC MP4 master with SRT subtitles.',
    },
  ];

  return (
    <div className="bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl p-5 sm:p-6 text-zinc-100 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 uppercase tracking-widest mb-1">
            <HelpCircle className="w-4 h-4" />
            <span>Filmmaker Documentation</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            M-b AI Film Studio Production Guide
          </h2>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Step-by-step filmmaking manual covering continuity preservation, approval gates, timeline editing, sound mixing, and MP4 delivery.
          </p>
        </div>

        <button
          type="button"
          onClick={onStartWorkflow}
          className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          <span>Go to Script Studio</span>
        </button>
      </div>

      {/* 6-Stage Guide Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.num}
              className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="font-mono text-xs font-bold text-zinc-500">STAGE {step.num}</span>
              </div>
              <h3 className="text-sm font-bold text-white">{step.title}</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">{step.summary}</p>
            </div>
          );
        })}
      </div>

      {/* Operational Rules Callout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2 text-xs">
          <div className="font-bold text-white flex items-center space-x-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <span>Why is the Timeline Editor Locked Initially?</span>
          </div>
          <p className="text-zinc-400 leading-relaxed">
            M-b AI Film Studio enforces real media verification: placeholder or procedural graphics never substitute for real footage on the timeline. Once every clip in your film has either a completed AI video or an uploaded MP4 file, Timeline editing unlocks automatically.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2 text-xs">
          <div className="font-bold text-white flex items-center space-x-2">
            <Volume2 className="w-4 h-4 text-purple-400" />
            <span>Multilingual Voices, Scores & Subtitles</span>
          </div>
          <p className="text-zinc-400 leading-relaxed">
            Combine Gemini TTS voices for multilingual scripts with Lyria 3 orchestral scores and built-in foley assets in Sound & Voice Studio, then enable Burn-In Subtitles or download SRT files in Export & Delivery.
          </p>
        </div>
      </div>
    </div>
  );
};
