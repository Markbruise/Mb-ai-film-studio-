/**
 * SMPTE Timecode and Duration formatters
 */

export function formatSMPTETimecode(totalSeconds: number, fps = 24): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const frames = Math.floor((safeSeconds % 1) * fps);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

export function formatDurationNice(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${Math.round(totalSeconds * 10) / 10}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = Math.round(totalSeconds % 60);
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m ${remainingSeconds > 0 ? `${remainingSeconds}s` : ''}`.trim();
}

export function parseDurationToSeconds(input: string | number): number {
  if (typeof input === 'number') return Math.max(4, Math.min(7200, input));
  const raw = input.toLowerCase().trim();
  if (raw.endsWith('h')) {
    const val = parseFloat(raw);
    return Math.max(4, Math.min(7200, (isNaN(val) ? 1 : val) * 3600));
  }
  if (raw.endsWith('m') || raw.endsWith('min')) {
    const val = parseFloat(raw);
    return Math.max(4, Math.min(7200, (isNaN(val) ? 1 : val) * 60));
  }
  if (raw.endsWith('s') || raw.endsWith('sec')) {
    const val = parseFloat(raw);
    return Math.max(4, Math.min(7200, isNaN(val) ? 4 : val));
  }
  // Try parsing mm:ss or hh:mm:ss
  const parts = raw.split(':').map((p) => parseFloat(p));
  if (parts.length === 3 && !parts.some(isNaN)) {
    return Math.max(4, Math.min(7200, parts[0] * 3600 + parts[1] * 60 + parts[2]));
  }
  if (parts.length === 2 && !parts.some(isNaN)) {
    return Math.max(4, Math.min(7200, parts[0] * 60 + parts[1]));
  }
  const parsed = parseFloat(raw);
  return isNaN(parsed) ? 30 : Math.max(4, Math.min(7200, parsed));
}
