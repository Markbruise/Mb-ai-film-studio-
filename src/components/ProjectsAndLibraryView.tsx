import React, { useEffect, useState } from 'react';
import { AssetLibraryItem, FilmProject, evaluateTimelineAccess } from '../types/film';
import { formatDurationNice } from '../utils/timecode';
import {
  FolderOpen,
  Image as ImageIcon,
  Copy,
  Archive,
  RotateCcw,
  Trash2,
  Play,
  Film,
  Music,
  Download,
  RefreshCw,
  HardDrive,
  Search,
  Users,
  Plus,
} from 'lucide-react';

interface ProjectsAndLibraryViewProps {
  initialTab: 'projects' | 'assets';
  activeProjectId: string;
  projects: FilmProject[];
  onSelectProject: (project: FilmProject) => void;
  onDuplicateProject: (projectId: string) => Promise<void>;
  onArchiveProject: (projectId: string, archived: boolean) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onCreateNewFromWelcome: () => void;
}

export const ProjectsAndLibraryView: React.FC<ProjectsAndLibraryViewProps> = ({
  initialTab,
  activeProjectId,
  projects,
  onSelectProject,
  onDuplicateProject,
  onArchiveProject,
  onDeleteProject,
  onCreateNewFromWelcome,
}) => {
  const [subTab, setSubTab] = useState<'projects' | 'assets'>(initialTab);
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetLibraryItem[]>([]);
  const [assetFilter, setAssetFilter] = useState<'all' | 'character' | 'storyboard' | 'video' | 'audio' | 'export'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loadingAssets, setLoadingAssets] = useState<boolean>(false);

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  const fetchAssets = async () => {
    setLoadingAssets(true);
    try {
      const res = await fetch('/api/assets/library');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.assets;
        if (Array.isArray(list)) {
          setAssets(list);
        }
      }
    } catch {
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  // Merge character & storyboard data URLs from active/stored projects with disk assets
  const derivedProjectAssets: AssetLibraryItem[] = [];
  projects.forEach((p) => {
    (p.characterProfiles || []).forEach((ch) => {
      if (ch.referenceImageUrl) {
        derivedProjectAssets.push({
          id: `char_${p.id}_${ch.id}`,
          kind: 'character',
          name: `${ch.name} — ${p.title}`,
          url: ch.referenceImageUrl,
          projectId: p.id,
          createdAt: p.updatedAt,
        });
      }
    });
    (p.storyboardFrames || []).forEach((fr) => {
      if (fr.imageUrl) {
        derivedProjectAssets.push({
          id: `sb_${p.id}_${fr.frameId}`,
          kind: 'storyboard',
          name: `${fr.title} — ${p.title}`,
          url: fr.imageUrl,
          projectId: p.id,
          createdAt: p.updatedAt,
        });
      }
    });
  });

  const combinedAssets = [...derivedProjectAssets, ...assets];
  const filteredAssets = combinedAssets.filter((item) => {
    const matchesKind = assetFilter === 'all' || item.kind === assetFilter;
    const matchesSearch =
      !searchQuery.trim() || item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesKind && matchesSearch;
  });

  const visibleProjects = projects.filter((p) => (showArchived ? true : !p.archived));

  return (
    <div className="bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl p-5 sm:p-6 text-zinc-100 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400 uppercase tracking-widest mb-1">
            {subTab === 'projects' ? <FolderOpen className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
            <span>Studio Repository</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {subTab === 'projects' ? 'My Film Projects' : 'Media & Asset Library'}
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            {subTab === 'projects'
              ? 'Resume unfinished productions, duplicate cut versions, archive completed films, or remove old drafts.'
              : 'Browse character sheets, storyboard stills, uploaded/generated video clips, synthesized dialogue, music scores, and exported MP4 masters.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs">
            <button
              type="button"
              onClick={() => setSubTab('projects')}
              className={`px-3.5 py-1.5 rounded-lg font-semibold transition ${
                subTab === 'projects' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              My Projects ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('assets')}
              className={`px-3.5 py-1.5 rounded-lg font-semibold transition ${
                subTab === 'assets' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Media Library ({combinedAssets.length})
            </button>
          </div>

          <button
            type="button"
            onClick={onCreateNewFromWelcome}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Film Project</span>
          </button>
        </div>
      </div>

      {/* SUBVIEW 1: MY PROJECTS */}
      {subTab === 'projects' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">
              Showing {visibleProjects.length} project(s)
            </span>
            <label className="flex items-center space-x-2 text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded bg-zinc-900 border-zinc-700 text-cyan-500"
              />
              <span>Show Archived Projects</span>
            </label>
          </div>

          {visibleProjects.length === 0 ? (
            <div className="p-8 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center text-sm text-zinc-500">
              No projects match the current filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleProjects.map((proj) => {
                const isActive = proj.id === activeProjectId;
                const access = evaluateTimelineAccess(proj);
                const approvedCount = (proj.storyboardFrames || []).filter(
                  (f) => f.approvalStatus === 'approved'
                ).length;
                const totalFrames = (proj.storyboardFrames || []).length;

                return (
                  <div
                    key={proj.id}
                    className={`p-4 rounded-xl border flex flex-col justify-between space-y-4 transition ${
                      isActive
                        ? 'bg-cyan-950/20 border-cyan-500/50 shadow-lg shadow-cyan-950/20'
                        : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="text-base font-bold text-white line-clamp-1">
                              {proj.title}
                            </h3>
                            {isActive && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                ACTIVE
                              </span>
                            )}
                            {proj.archived && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">
                                ARCHIVED
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-400 mt-0.5">
                            {proj.genre} • {proj.aspectRatio} • {formatDurationNice(proj.targetDurationSeconds)}
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {proj.logline || proj.description || 'Film production workspace.'}
                      </p>

                      <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
                        <div className="bg-zinc-950 p-2 rounded border border-zinc-800">
                          <span className="text-zinc-500 block text-[9px]">SCENES</span>
                          <span className="text-white font-bold">{proj.scenes.length}</span>
                        </div>
                        <div className="bg-zinc-950 p-2 rounded border border-zinc-800">
                          <span className="text-zinc-500 block text-[9px]">FRAMES</span>
                          <span className="text-indigo-300 font-bold">
                            {approvedCount}/{totalFrames}
                          </span>
                        </div>
                        <div className="bg-zinc-950 p-2 rounded border border-zinc-800">
                          <span className="text-zinc-500 block text-[9px]">VIDEOS</span>
                          <span className="text-emerald-300 font-bold">
                            {access.readyClips}/{access.totalClips}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectProject(proj)}
                          className="flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition"
                        >
                          <Play className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{isActive ? 'Open Workspace' : 'Resume Project'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateProject(proj.id)}
                          title="Duplicate Project"
                          className="p-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onArchiveProject(proj.id, !proj.archived)}
                          title={proj.archived ? 'Restore Project' : 'Archive Project'}
                          className="p-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition"
                        >
                          {proj.archived ? (
                            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Archive className="w-3.5 h-3.5 text-amber-400" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteId(confirmDeleteId === proj.id ? null : proj.id)
                          }
                          title="Delete Project"
                          className="p-2 rounded-lg bg-zinc-950 hover:bg-rose-950/60 border border-zinc-800 text-zinc-400 hover:text-rose-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {confirmDeleteId === proj.id && (
                        <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 flex items-center justify-between text-xs">
                          <span className="text-rose-200 font-semibold">Delete permanently?</span>
                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 rounded bg-zinc-900 text-zinc-300"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteProject(proj.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-1 rounded bg-rose-600 text-white font-bold"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBVIEW 2: MEDIA & ASSET LIBRARY */}
      {subTab === 'assets' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  { id: 'all', label: 'All Assets' },
                  { id: 'character', label: 'Characters' },
                  { id: 'storyboard', label: 'Storyboards' },
                  { id: 'video', label: 'Video Clips' },
                  { id: 'audio', label: 'Audio & Music' },
                  { id: 'export', label: 'Final Exports' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setAssetFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg font-medium border transition ${
                    assetFilter === f.id
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search media..."
                  className="pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <button
                type="button"
                onClick={fetchAssets}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300"
                title="Refresh Disk Library"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAssets ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {filteredAssets.length === 0 ? (
            <div className="p-8 rounded-xl bg-zinc-900/40 border border-zinc-800 text-center text-sm text-zinc-500">
              No media assets found in this category.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAssets.map((item) => (
                <div
                  key={item.id}
                  className="bg-zinc-900/70 rounded-xl border border-zinc-800 overflow-hidden flex flex-col justify-between"
                >
                  <div className="bg-black aspect-video flex items-center justify-center overflow-hidden">
                    {item.kind === 'video' || item.kind === 'export' ? (
                      <video
                        src={item.url}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-contain"
                      />
                    ) : item.kind === 'audio' ? (
                      <div className="w-full px-4 flex flex-col items-center space-y-2">
                        <Music className="w-8 h-8 text-purple-400" />
                        <audio src={item.url} controls className="w-full h-8" />
                      </div>
                    ) : (
                      <img
                        src={item.url}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  <div className="p-3 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">{item.name}</div>
                      <div className="flex items-center space-x-2 text-[10px] text-zinc-400 font-mono mt-0.5">
                        <span className="uppercase text-cyan-400">{item.kind}</span>
                        {item.sizeBytes ? (
                          <span>• {(item.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                        ) : null}
                      </div>
                    </div>

                    <a
                      href={item.url}
                      download={item.name}
                      className="p-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 shrink-0"
                      title="Download Asset"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
