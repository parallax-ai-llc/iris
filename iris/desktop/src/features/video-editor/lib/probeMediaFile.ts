/**
 * probeMediaFile — extract duration / dimensions / thumbnail from a media URL.
 *
 * Runs entirely in the renderer using a hidden <video>/<audio> element and a
 * canvas frame grab. Shared by local-file imports (VideoEditor) and processing
 * flows that produce a new local file (e.g. silence removal) so every path
 * populates the media pool with a poster thumbnail the same way.
 */

export interface VideoProbeResult {
  duration: number;
  width: number;
  height: number;
  thumbnailUrl: string | null;
}

/**
 * Probe video metadata (duration, dimensions) and extract a representative
 * thumbnail frame (seeked to ~10% of duration) as a JPEG data URL.
 */
export function probeVideoFile(videoUrl: string): Promise<VideoProbeResult> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    // Required so canvas.toDataURL() doesn't throw on a "tainted" canvas.
    // The local media server sends Access-Control-Allow-Origin: *, but the
    // browser only treats the frame as same-origin-readable when the element
    // opts into CORS. Without this, thumbnail extraction silently fails.
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => { video.src = ''; video.load(); };
    const fallback = () => { cleanup(); resolve({ duration: 0, width: 0, height: 0, thumbnailUrl: null }); };
    const timeout = setTimeout(fallback, 15000);

    video.onloadedmetadata = () => {
      const dur = isFinite(video.duration) ? video.duration : 0;
      const w = video.videoWidth || 0;
      const h = video.videoHeight || 0;

      if (dur <= 0) {
        clearTimeout(timeout);
        cleanup();
        resolve({ duration: 0, width: w, height: h, thumbnailUrl: null });
        return;
      }

      // Seek to 10% of duration for a representative thumbnail
      video.currentTime = Math.min(dur * 0.1, 2);
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      const dur = isFinite(video.duration) ? video.duration : 0;
      const w = video.videoWidth || 0;
      const h = video.videoHeight || 0;

      // Extract frame to canvas
      let thumbnailUrl: string | null = null;
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 320 / Math.max(w, 1));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
        }
      } catch {
        // Canvas extraction may fail due to CORS
      }

      cleanup();
      resolve({ duration: dur, width: w, height: h, thumbnailUrl });
    };

    video.onerror = () => { clearTimeout(timeout); fallback(); };
    video.src = videoUrl;
  });
}

/** Probe an audio file's duration via an <audio> element (no <video>, no thumbnail). */
export function probeAudioFile(audioUrl: string): Promise<{ duration: number }> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    const cleanup = () => { audio.src = ''; audio.load(); };
    const fallback = () => { cleanup(); resolve({ duration: 0 }); };
    const timeout = setTimeout(fallback, 15000);

    audio.onloadedmetadata = () => {
      clearTimeout(timeout);
      const dur = isFinite(audio.duration) ? audio.duration : 0;
      cleanup();
      resolve({ duration: dur });
    };

    audio.onerror = () => { clearTimeout(timeout); fallback(); };
    audio.src = audioUrl;
  });
}
