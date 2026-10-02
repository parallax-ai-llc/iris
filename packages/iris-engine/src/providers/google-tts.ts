/**
 * Parallax Iris - Gemini TTS helpers (gemini-3.8-flash-tts)
 *
 * Request shape, voices and audio format follow the Gemini API speech
 * generation docs (https://ai.google.dev/gemini-api/docs/speech-generation and
 * the gemini-3.8-flash-tts model page), checked 2026-10-02:
 * - generateContent with `responseModalities: ['AUDIO']` and
 *   `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`.
 * - Gemini 3.8 TTS returns WAV (`audio/wav`, RIFF header, 16-bit signed
 *   little-endian PCM, 24 kHz mono) by default for unary requests. Earlier TTS
 *   models returned headerless PCM (`audio/L16;codec=pcm;rate=24000`), so the
 *   response is handled by its bytes: a RIFF/WAVE payload is kept as is and raw
 *   PCM gets a WAV header.
 */

export const GEMINI_TTS_MODEL = 'gemini-3.8-flash-tts';

/** The 30 prebuilt voices listed in the speech generation docs. */
export const GEMINI_TTS_VOICES = [
  'Zephyr',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Aoede',
  'Callirrhoe',
  'Autonoe',
  'Enceladus',
  'Iapetus',
  'Umbriel',
  'Algieba',
  'Despina',
  'Erinome',
  'Algenib',
  'Rasalgethi',
  'Laomedeia',
  'Achernar',
  'Alnilam',
  'Schedar',
  'Gacrux',
  'Pulcherrima',
  'Achird',
  'Zubenelgenubi',
  'Vindemiatrix',
  'Sadachbia',
  'Sadaltager',
  'Sulafat',
] as const;

export const GEMINI_TTS_DEFAULT_VOICE = 'Kore';

/**
 * Prebuilt voice name for a requested voice. Matching ignores case. Anything
 * else (an OpenAI name like `alloy` left over from the workflow node default,
 * an ElevenLabs voice id, nothing) falls back to the default voice instead of
 * failing the request.
 */
export function resolveGeminiTtsVoice(voice: unknown): string {
  if (typeof voice !== 'string') return GEMINI_TTS_DEFAULT_VOICE;
  const wanted = voice.trim().toLowerCase();
  return (
    GEMINI_TTS_VOICES.find(name => name.toLowerCase() === wanted) ??
    GEMINI_TTS_DEFAULT_VOICE
  );
}

const DEFAULT_PCM_SAMPLE_RATE = 24000;

/** 44-byte canonical WAV header for 16-bit PCM. */
export function buildPcmWavHeader(
  dataBytes: number,
  sampleRate: number = DEFAULT_PCM_SAMPLE_RATE,
  channels: number = 1
): Buffer {
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

function isRiffWave(buf: Buffer): boolean {
  return (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WAVE'
  );
}

/** Length of a RIFF/WAVE payload in seconds, from its fmt and data chunks. */
function wavDurationSeconds(buf: Buffer): number | undefined {
  let byteRate: number | undefined;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ' && offset + 20 <= buf.length) {
      byteRate = buf.readUInt32LE(offset + 16);
    } else if (id === 'data') {
      // Streaming-style WAVs may carry 0 or 0xFFFFFFFF as the data size.
      const available = buf.length - (offset + 8);
      const dataBytes = size > 0 && size <= available ? size : available;
      return byteRate ? dataBytes / byteRate : undefined;
    }
    offset += 8 + size + (size % 2);
  }
  return undefined;
}

function sampleRateFromMimeType(mimeType: string): number {
  const match = /rate=(\d+)/i.exec(mimeType);
  const rate = match ? Number(match[1]) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_PCM_SAMPLE_RATE;
}

export interface NormalizedGeminiTtsAudio {
  /** WAV bytes, base64 */
  base64: string;
  mimeType: 'audio/wav';
  durationSeconds?: number;
}

/**
 * Turn the inline audio Gemini returned into a WAV file.
 * - RIFF/WAVE bytes (3.8 default): kept as is.
 * - Raw 16-bit PCM (`audio/L16`, `audio/pcm`, or no header at all): wrapped
 *   in a WAV header using the `rate=` from the mime type (24 kHz default).
 * - mu-law / A-law: not requested by this adapter, so rejected.
 */
export function normalizeGeminiTtsAudio(
  base64: string,
  mimeType: string | undefined
): NormalizedGeminiTtsAudio {
  const buf = Buffer.from(base64, 'base64');
  if (buf.length === 0) {
    throw new Error('Gemini TTS returned empty audio');
  }

  if (isRiffWave(buf)) {
    return {
      base64,
      mimeType: 'audio/wav',
      durationSeconds: wavDurationSeconds(buf),
    };
  }

  const type = (mimeType || '').toLowerCase();
  if (type.includes('mulaw') || type.includes('alaw')) {
    throw new Error(`Unsupported Gemini TTS audio format: ${mimeType}`);
  }

  const sampleRate = sampleRateFromMimeType(type);
  const wav = Buffer.concat([buildPcmWavHeader(buf.length, sampleRate), buf]);
  return {
    base64: wav.toString('base64'),
    mimeType: 'audio/wav',
    durationSeconds: buf.length / (sampleRate * 2),
  };
}
