import React from 'react';
import { FilmProject, ContinuityIssue } from '../types/film';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Compass,
  Sun,
  UserCheck,
  Video,
  Wand2,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface ContinuityAssistantPanelProps {
  project: FilmProject;
  onApplyFix: (issueId: string) => void;
  onReauditContinuity: () => Promise<void>;
  isAuditing: boolean;
}

export const ContinuityAssistantPanel: React.FC<ContinuityAssistantPanelProps> = ({
  project,
  onApplyFix,
  onReauditContinuity,
  isAuditing,
}) => {
  const issues = project.continuityIssues || [];
  const pendingIssues = issues.filter((i) => !i.applied);
  const resolvedIssues = issues.filter((i) => i.applied);

  // Calculate health score: 100 - (pending high * 12 + pending med * 6 + pending low * 2)
  const penalty = pendingIssues.reduce(
    (acc, cur) => acc + (cur.severity === 'high' ? 12 : cur.severity === 'medium' ? 6 : 2),
    0
  );
  const continuityScore = Math.max(65, Math.min(100, 100 - penalty));

  return (
    <div className="bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl p-6 text-zinc-100 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-1">
            <Sparkles className="w-4 h-4" />
            <span>AI Script Supervisor & Continuity Suite</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Film Continuity Assistant
          </h2>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Monitors character appearance, costume, lighting key, camera style, time-of-day transitions, props, and screen direction (180-degree rule) across consecutive shots.
          </p>
        </div>

        {/* Continuity Health Badge */}
        <div className="flex items-center space-x-4 bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3 shrink-0">
          <div className="relative w-12 h-12 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-zinc-800"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className={continuityScore > 90 ? 'text-emerald-400' : continuityScore > 75 ? 'text-amber-400' : 'text-rose-400'}
                strokeDasharray={`${continuityScore}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute font-mono text-sm font-bold text-white">{continuityScore}%</span>
          </div>
          <div>
            <div className="text-[11px] text-zinc-400 uppercase font-semibold">Continuity Score</div>
            <div className="text-sm font-semibold text-zinc-200">
              {continuityScore >= 95
                ? 'High Visual Cohesion'
                : continuityScore >= 80
                ? 'Minor Discrepancies'
                : 'Needs Axis Calibration'}
            </div>
          </div>
          <button
            onClick={onReauditContinuity}
            disabled={isAuditing}
            className="ml-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 transition flex items-center space-x-1.5"
          >
            {isAuditing ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span>Re-Audit Sequence</span>
          </button>
        </div>
      </div>

      {/* Continuity Pillars Reference Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800">
          <div className="flex items-center space-x-2 text-cyan-400 text-xs font-semibold mb-1">
            <Compass className="w-4 h-4" />
            <span>Screen Direction</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Preserves 180-degree axis of action. Prevents disorienting spatial flips across cuts.
          </p>
        </div>

        <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800">
          <div className="flex items-center space-x-2 text-amber-400 text-xs font-semibold mb-1">
            <Sun className="w-4 h-4" />
            <span>Lighting & Time-of-Day</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Maintains color temperature (Kelvin), shadow direction, and atmospheric haze consistency.
          </p>
        </div>

        <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800">
          <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold mb-1">
            <UserCheck className="w-4 h-4" />
            <span>Character Wardrobe</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Injected visual token descriptors guarantee costume, hair, and armor stay anchored.
          </p>
        </div>

        <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800">
          <div className="flex items-center space-x-2 text-purple-400 text-xs font-semibold mb-1">
            <Video className="w-4 h-4" />
            <span>Lens & Motion Vector</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Matches focal length (35mm Anamorphic) and camera momentum between adjoining cuts.
          </p>
        </div>
      </div>

      {/* Issues / Audit Results */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          <span>Identified Continuity Observations ({pendingIssues.length} Pending, {resolvedIssues.length} Resolved)</span>
        </div>

        {pendingIssues.length === 0 ? (
          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-6 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <h4 className="text-sm font-bold text-emerald-300">Clean Continuity Pipeline</h4>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              All shots comply with screen direction, lighting palettes, and costume consistency rules. Transitions are seamless.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingIssues.map((issue) => (
              <div
                key={issue.id}
                className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 transition space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        issue.severity === 'high'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : issue.severity === 'medium'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      }`}
                    >
                      {issue.severity} Priority
                    </span>
                    <span className="text-xs font-bold text-white">
                      Shot #{issue.shotNumberA} ➔ Shot #{issue.shotNumberB}
                    </span>
                    <span className="text-xs text-zinc-500 capitalize">
                      ({issue.issueType.replace('_', ' ')})
                    </span>
                  </div>

                  <button
                    onClick={() => onApplyFix(issue.id)}
                    className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition active:scale-95"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Apply Continuity Fix</span>
                  </button>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  {issue.description}
                </p>

                <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80 text-xs text-cyan-300/90 font-mono flex items-start space-x-2">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                  <span>
                    <strong>Recommended Director Fix:</strong> {issue.recommendation}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Disclaimers & Model Realities Notice as requested in brief */}
      <div className="text-xs text-zinc-500 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60 leading-relaxed">
        <strong>Notice on AI Generative Continuity:</strong> While M-b Film Studio enforces strict prompt conditioning, screen direction vectors, and character reference anchors, AI video providers (such as Veo 2, Runway Gen-3, Sora) may introduce slight procedural variations. Use keyframe reference conditioning and matched focal lengths for maximum visual stability.
      </div>
    </div>
  );
};
