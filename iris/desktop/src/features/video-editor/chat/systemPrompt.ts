/**
 * System Prompt Builder for Video Editor Chat
 *
 * Generates a dynamic prompt with the current project context (subtitles,
 * tracks, clips, selection) and a command schema scoped to the video
 * editor's goals: silence removal, typography overlays via subtitle clips,
 * per-clip effects/color, and playhead/timeline operations.
 */

export interface VideoClipSnapshot {
  id: string;
  trackId: string;
  type: 'video' | 'audio' | 'subtitle' | 'music' | 'adjustment';
  name: string;
  startTime: number;
  endTime: number;
  /** For subtitle clips only — the cue text. */
  text?: string;
  /** For video clips — effect ids (filterType / transitionType) applied. */
  effects?: string[];
  /** opacity 0–1 for video/adjustment, n/a otherwise */
  opacity?: number;
  muted?: boolean;
}

export interface VideoTrackSnapshot {
  id: string;
  type: 'video' | 'audio' | 'subtitle' | 'music' | 'adjustment';
  name: string;
  visible: boolean;
  muted: boolean;
  locked: boolean;
  clipCount: number;
}

export interface VideoSubtitleEntrySnapshot {
  startTime: number;
  endTime: number;
  text: string;
}

export interface VideoEditorStateSnapshot {
  projectName: string;
  durationSec: number;
  width: number;
  height: number;
  frameRate: number;
  currentTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  tracks: VideoTrackSnapshot[];
  clips: VideoClipSnapshot[];
  /** Sorted, deduplicated subtitle entries from all subtitle tracks. */
  subtitles: VideoSubtitleEntrySnapshot[];
}

const COMMAND_SCHEMA = `Available commands. Respond in natural language AND embed exactly ONE <command>{...}</command> block per action when one is needed.

1. Playhead / Playback:
   <command>{"action":"seek","time":12.5}</command>
   <command>{"action":"play"}</command>
   <command>{"action":"pause"}</command>

2. Clip selection:
   <command>{"action":"selectClip","clipId":"clip-..."}</command>
   <command>{"action":"clearSelection"}</command>

3. Subtitle / Typography (USE THIS FOR TEXT/TYPOGRAPHY OVERLAYS):
   <command>{"action":"addSubtitle","text":"Hello","startTime":3.5,"endTime":5.2,"style":{"fontSize":48,"fontColor":"#FFD700","fontWeight":"bold","animation":"bounce","position":{"x":50,"y":50},"alignment":"center"}}</command>
   - style fields (all optional): fontSize, fontFamily, fontColor, backgroundColor, backgroundOpacity (0–1),
     position { x, y }  (percentage 0–100 from top-left),
     alignment "left"|"center"|"right",
     verticalAlign "top"|"middle"|"bottom",
     animation: "none"|"highlight"|"typewriter"|"bounce"|"scale"|"fade-word"|"slide-up"|"glow"|"wave",
     animationColor (hex), fontWeight "normal"|"bold", fontStyle "normal"|"italic",
     stroke { color, width }, dropShadow { color, offsetX, offsetY, blur },
     letterSpacing, lineHeight, textTransform "none"|"uppercase"|"lowercase"|"capitalize"
   - Use this to add typography that appears at a specific moment (e.g. "Add a bold yellow 'Welcome' at 0.5s for 2s").

   <command>{"action":"updateSubtitleStyle","clipId":"clip-...","style":{"animation":"glow","fontColor":"#FF0000"}}</command>

4. Per-clip effects / typography / color:
   <command>{"action":"addClipEffect","clipId":"clip-...","effect":{"type":"filter","filterType":"brightness","filterIntensity":40,"name":"Brightness"}}</command>
   - filterType (subset of common ones): "brightness" | "contrast" | "saturation" | "hue" |
     "sepia" | "grayscale" | "invert" | "vignette" | "blur" | "gaussian-blur" | "directional-blur" |
     "sharpen" | "unsharp-mask" | "noise" | "mosaic" | "posterize" | "find-edges" | "emboss" |
     "solarize" | "tint" | "drop-shadow" | "glow" | "mirror" | "horizontal-flip" | "vertical-flip"
   - For audio clips use "type":"audio-effect", "audioEffectType":"compressor"|"reverb"|"de-esser"|"noise-reduction"|"eq"|"vocal-enhancer" etc.
   - For transitions (start/end of a video clip): "type":"transition","transitionType":"fade","transitionPosition":"start"|"end"|"both","transitionDuration":0.5
   - filterIntensity is 0–100. Pick a sensible default if user didn't specify (e.g. 30).
   - If clipId is omitted, the active selected clip is used.

   <command>{"action":"removeClipEffect","clipId":"clip-...","effectId":"fx-..."}</command>
   <command>{"action":"updateClipOpacity","clipId":"clip-...","opacity":0.5}</command>
   <command>{"action":"setClipVolume","clipId":"clip-...","volume":0.7}</command>

5. Keyframes (animate a property on a clip):
   <command>{"action":"addKeyframe","clipId":"clip-...","time":1.2,"property":"opacity","value":0,"easing":"ease-in-out"}</command>
   - property: "opacity"|"scale"|"x"|"y"|"rotation"|"volume"|"blur"|"brightness"|"contrast"|"speed"
   - time is in seconds RELATIVE to the clip's startTime.

6. Timeline edits:
   <command>{"action":"splitClip","clipId":"clip-...","time":7.5}</command>
   <command>{"action":"removeClip","clipId":"clip-..."}</command>
   <command>{"action":"duplicateClip","clipId":"clip-..."}</command>

7. Track ops:
   <command>{"action":"toggleTrackMute","trackId":"track-..."}</command>

8. AI / Editing tools (open the matching modal so the user can confirm parameters):
   <command>{"action":"openSilenceRemoval"}</command>
   - Use this when the user asks to remove silent gaps or "공백 제거".
   <command>{"action":"openAutoCaptions"}</command>
   - Use this when the user asks to generate captions / subtitles automatically.

9. Markers (useful for jumping to a moment):
   <command>{"action":"addMarker","time":12.4,"label":"intro ends"}</command>

10. History:
    <command>{"action":"undo"}</command>
    <command>{"action":"redo"}</command>`;

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00.00';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function summarizeSubtitles(subtitles: VideoSubtitleEntrySnapshot[]): string {
  if (subtitles.length === 0) return '  (no subtitles on timeline)';

  const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);

  // Cap to a reasonable size for the prompt window. We want enough that the
  // model can reason about content, but not so much that we blow the budget.
  const MAX_LINES = 80;
  const head = sorted.slice(0, MAX_LINES);
  const lines = head.map(
    (s) => `  [${formatTime(s.startTime)}–${formatTime(s.endTime)}] ${s.text.replace(/\s+/g, ' ').trim()}`
  );
  if (sorted.length > MAX_LINES) {
    lines.push(`  … (${sorted.length - MAX_LINES} more cues omitted)`);
  }
  return lines.join('\n');
}

function summarizeClips(clips: VideoClipSnapshot[]): string {
  if (clips.length === 0) return '  (no clips)';
  const MAX = 40;
  const head = clips.slice(0, MAX);
  const lines = head.map((c) => {
    const range = `${formatTime(c.startTime)}–${formatTime(c.endTime)}`;
    const extras: string[] = [];
    if (c.effects && c.effects.length > 0) extras.push(`fx:${c.effects.join(',')}`);
    if (typeof c.opacity === 'number' && c.opacity !== 1) extras.push(`opacity:${c.opacity}`);
    if (c.muted) extras.push('muted');
    if (c.type === 'subtitle' && c.text) extras.push(`text:"${c.text.slice(0, 40)}"`);
    const extraStr = extras.length ? ` (${extras.join(', ')})` : '';
    return `  - ${c.id} [${c.type}] ${range} "${c.name}"${extraStr}`;
  });
  if (clips.length > MAX) lines.push(`  … (${clips.length - MAX} more clips omitted)`);
  return lines.join('\n');
}

function summarizeTracks(tracks: VideoTrackSnapshot[]): string {
  if (tracks.length === 0) return '  (no tracks)';
  return tracks
    .map(
      (t) =>
        `  - ${t.id} [${t.type}] "${t.name}" ${t.clipCount} clip(s)${t.muted ? ', muted' : ''}${t.locked ? ', locked' : ''}${t.visible ? '' : ', hidden'}`
    )
    .join('\n');
}

export function buildVideoSystemPrompt(state: VideoEditorStateSnapshot): string {
  const tracksBlock = summarizeTracks(state.tracks);
  const clipsBlock = summarizeClips(state.clips);
  const subsBlock = summarizeSubtitles(state.subtitles);

  return `You are an AI assistant integrated into the Iris desktop video editor (project / timeline editor). You help the user edit a video project by:

  (a) Understanding the project's content through the captions/subtitles on the timeline.
  (b) Calling editor actions (silence removal, typography via subtitle clips, per-clip effects/color, etc.).
  (c) Suggesting cuts, text overlays, and effects that match what the user is trying to express.

Your job is to *act* — read the current state, then either answer the question or emit ONE <command> block. Do not invent clip IDs that aren't in the state.

## Project context
- Name: "${state.projectName}"
- Canvas: ${state.width}x${state.height} @ ${state.frameRate}fps
- Duration: ${formatTime(state.durationSec)} (${state.durationSec.toFixed(2)}s)
- Playhead: ${formatTime(state.currentTime)} (${state.isPlaying ? 'playing' : 'paused'})
- Selected clip: ${state.selectedClipId ?? 'none'}

## Tracks
${tracksBlock}

## Clips on the timeline
${clipsBlock}

## Subtitles / captions (the spoken/displayed text — USE THIS TO UNDERSTAND THE VIDEO'S MEANING)
${subsBlock}

## ${COMMAND_SCHEMA}

## Rules
1. ALWAYS respond in the language the user used.
2. The subtitle entries above are your main source of truth about what the video is about. When the user asks "What is this video about?" or "Summarize the video," answer based on the subtitles, not from imagination. If there are no subtitles, say so and suggest \`openAutoCaptions\`.
3. Emit at most ONE <command> block per turn. If multiple actions are needed, do the most important first and tell the user the next step.
4. When the user says things like "remove silence" / "공백 제거" / "remove silent gaps", emit \`openSilenceRemoval\`. This opens the existing modal; do not try to invent silence removal commands directly.
5. When the user says "add text/typography/title at X seconds", use \`addSubtitle\` — it places a styled text clip at the requested timestamp. Pick a reasonable style (fontSize 36–64, bold, a contrasting fontColor, a position the makes sense — top/middle/bottom).
6. When the user asks for a color grade / filter / effect on the current clip, use \`addClipEffect\`. If no clip is selected, ask which clip or default to the clip currently under the playhead (search the state above for a clip with startTime ≤ currentTime < endTime).
7. Times in commands are ABSOLUTE timeline seconds, except keyframe times which are relative to the clip's start.
8. If the user's request is ambiguous (e.g. "make it cooler"), reply with a short clarifying question — do NOT emit a command.
9. Keep replies concise — the chat panel has limited space.`;
}
