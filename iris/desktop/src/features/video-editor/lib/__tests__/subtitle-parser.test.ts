import { describe, it, expect } from 'vitest';
import {
  parseSrt,
  parseVtt,
  parseSubtitleFile,
  exportToSrt,
  exportToVtt,
  type SubtitleEntry,
} from '../subtitle-parser';

// ==================== parseSrt ====================

describe('parseSrt', () => {
  it('parses valid SRT with multiple entries', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,000 --> 00:00:08,500
Second subtitle`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      index: 1,
      startTime: 1,
      endTime: 4,
      text: 'Hello world',
    });
    expect(entries[1]).toEqual({
      index: 2,
      startTime: 5,
      endTime: 8.5,
      text: 'Second subtitle',
    });
  });

  it('handles time with hours, minutes, and milliseconds', () => {
    const srt = `1
01:30:15,250 --> 02:00:00,000
Long video subtitle`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(1);
    expect(entries[0].startTime).toBe(1 * 3600 + 30 * 60 + 15 + 0.25);
    expect(entries[0].endTime).toBe(2 * 3600);
  });

  it('handles dot separator in time (non-standard but supported)', () => {
    const srt = `1
00:00:01.000 --> 00:00:04.000
Dot separator`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(1);
    expect(entries[0].startTime).toBe(1);
    expect(entries[0].endTime).toBe(4);
  });

  it('handles multi-line subtitle text', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Line one
Line two
Line three`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Line one\nLine two\nLine three');
  });

  it('returns empty array for empty content', () => {
    expect(parseSrt('')).toEqual([]);
    expect(parseSrt('   ')).toEqual([]);
  });

  it('skips malformed blocks (missing timestamp)', () => {
    const srt = `1
not a timestamp
Hello world

2
00:00:05,000 --> 00:00:08,000
Valid entry`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Valid entry');
  });

  it('skips blocks with non-numeric index', () => {
    const srt = `abc
00:00:01,000 --> 00:00:04,000
Bad index

2
00:00:05,000 --> 00:00:08,000
Good entry`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(1);
    expect(entries[0].index).toBe(2);
  });

  it('skips blocks with fewer than 3 lines', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(0);
  });

  it('handles \\r\\n line endings', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:04,000\r\nHello\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nWorld';

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(2);
    expect(entries[0].text).toBe('Hello');
    expect(entries[1].text).toBe('World');
  });
});

// ==================== parseVtt ====================

describe('parseVtt', () => {
  it('parses valid VTT with WEBVTT header', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world

00:00:05.000 --> 00:00:08.500
Second subtitle`;

    const entries = parseVtt(vtt);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      index: 1,
      startTime: 1,
      endTime: 4,
      text: 'Hello world',
    });
    expect(entries[1]).toEqual({
      index: 2,
      startTime: 5,
      endTime: 8.5,
      text: 'Second subtitle',
    });
  });

  it('handles MM:SS.mmm short-form timestamps', () => {
    const vtt = `WEBVTT

01:30.000 --> 02:00.000
Short form`;

    const entries = parseVtt(vtt);
    expect(entries).toHaveLength(1);
    expect(entries[0].startTime).toBe(90);
    expect(entries[0].endTime).toBe(120);
  });

  it('handles mixed HH:MM:SS.mmm and MM:SS.mmm formats', () => {
    const vtt = `WEBVTT

00:01:30.000 --> 00:02:00.000
Full form

01:30.000 --> 02:00.000
Short form`;

    const entries = parseVtt(vtt);
    expect(entries).toHaveLength(2);
    expect(entries[0].startTime).toBe(90);
    expect(entries[1].startTime).toBe(90);
  });

  it('returns empty array for empty content', () => {
    expect(parseVtt('')).toEqual([]);
    expect(parseVtt('WEBVTT')).toEqual([]);
    expect(parseVtt('WEBVTT\n\n')).toEqual([]);
  });

  it('handles multi-line cue text', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Line one
Line two`;

    const entries = parseVtt(vtt);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Line one\nLine two');
  });

  it('handles VTT with cue identifiers', () => {
    // Cue identifiers are lines before the timestamp that don't contain '-->'
    // The parser skips non-timestamp lines, so identifiers are ignored
    const vtt = `WEBVTT

intro
00:00:01.000 --> 00:00:04.000
Hello world`;

    const entries = parseVtt(vtt);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Hello world');
  });

  it('handles \\r\\n line endings', () => {
    const vtt = 'WEBVTT\r\n\r\n00:00:01.000 --> 00:00:04.000\r\nHello\r\n\r\n00:00:05.000 --> 00:00:08.000\r\nWorld';

    const entries = parseVtt(vtt);
    expect(entries).toHaveLength(2);
    expect(entries[0].text).toBe('Hello');
    expect(entries[1].text).toBe('World');
  });

  it('assigns sequential 1-based indices', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
First

00:00:03.000 --> 00:00:04.000
Second

00:00:05.000 --> 00:00:06.000
Third`;

    const entries = parseVtt(vtt);
    expect(entries.map((e) => e.index)).toEqual([1, 2, 3]);
  });
});

// ==================== parseSubtitleFile ====================

describe('parseSubtitleFile', () => {
  it('auto-detects SRT format by numeric first line', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello world`;

    const result = parseSubtitleFile(srt);
    expect(result).not.toBeNull();
    expect(result!.format).toBe('srt');
    expect(result!.entries).toHaveLength(1);
  });

  it('auto-detects VTT format by WEBVTT header', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world`;

    const result = parseSubtitleFile(vtt);
    expect(result).not.toBeNull();
    expect(result!.format).toBe('vtt');
    expect(result!.entries).toHaveLength(1);
  });

  it('returns null for unparseable content', () => {
    expect(parseSubtitleFile('')).toBeNull();
    expect(parseSubtitleFile('just some random text')).toBeNull();
    expect(parseSubtitleFile('no subtitles here\nat all')).toBeNull();
  });

  it('falls back to trying both parsers when first line is not numeric or WEBVTT', () => {
    // An SRT that somehow has leading whitespace on index
    // The fallback tries parseSrt then parseVtt
    const ambiguous = `WEBVTT

00:00:01.000 --> 00:00:04.000
Detected as VTT`;

    const result = parseSubtitleFile(ambiguous);
    expect(result).not.toBeNull();
    expect(result!.format).toBe('vtt');
  });
});

// ==================== exportToSrt ====================

describe('exportToSrt', () => {
  it('converts entries to valid SRT string', () => {
    const entries: SubtitleEntry[] = [
      { index: 1, startTime: 1, endTime: 4, text: 'Hello world' },
      { index: 2, startTime: 5, endTime: 8.5, text: 'Second subtitle' },
    ];

    const srt = exportToSrt(entries);
    expect(srt).toBe(
      '1\n00:00:01,000 --> 00:00:04,000\nHello world\n\n' +
      '2\n00:00:05,000 --> 00:00:08,500\nSecond subtitle\n'
    );
  });

  it('sorts entries by start time', () => {
    const entries: SubtitleEntry[] = [
      { index: 2, startTime: 5, endTime: 8, text: 'Second' },
      { index: 1, startTime: 1, endTime: 4, text: 'First' },
    ];

    const srt = exportToSrt(entries);
    expect(srt).toContain('1\n00:00:01,000');
    expect(srt).toContain('2\n00:00:05,000');
    expect(srt.indexOf('First')).toBeLessThan(srt.indexOf('Second'));
  });

  it('re-indexes entries starting from 1', () => {
    const entries: SubtitleEntry[] = [
      { index: 10, startTime: 1, endTime: 2, text: 'A' },
      { index: 20, startTime: 3, endTime: 4, text: 'B' },
    ];

    const srt = exportToSrt(entries);
    const lines = srt.split('\n');
    expect(lines[0]).toBe('1');
    expect(lines[4]).toBe('2');
  });

  it('handles time with hours', () => {
    const entries: SubtitleEntry[] = [
      { index: 1, startTime: 3661.5, endTime: 7200, text: 'Long time' },
    ];

    const srt = exportToSrt(entries);
    expect(srt).toContain('01:01:01,500 --> 02:00:00,000');
  });

  it('returns just a newline for empty entries array', () => {
    expect(exportToSrt([])).toBe('\n');
  });

  it('round-trip: parse SRT -> export SRT -> parse again produces same entries', () => {
    const original = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,500 --> 00:00:09,250
Multi line
subtitle text`;

    const parsed = parseSrt(original);
    const exported = exportToSrt(parsed);
    const reparsed = parseSrt(exported);

    expect(reparsed).toHaveLength(parsed.length);
    for (let i = 0; i < parsed.length; i++) {
      expect(reparsed[i].startTime).toBe(parsed[i].startTime);
      expect(reparsed[i].endTime).toBe(parsed[i].endTime);
      expect(reparsed[i].text).toBe(parsed[i].text);
    }
  });
});

// ==================== exportToVtt ====================

describe('exportToVtt', () => {
  it('converts entries to valid VTT string with WEBVTT header', () => {
    const entries: SubtitleEntry[] = [
      { index: 1, startTime: 1, endTime: 4, text: 'Hello world' },
      { index: 2, startTime: 5, endTime: 8.5, text: 'Second subtitle' },
    ];

    const vtt = exportToVtt(entries);
    expect(vtt).toBe(
      'WEBVTT\n\n' +
      '00:00:01.000 --> 00:00:04.000\nHello world\n\n' +
      '00:00:05.000 --> 00:00:08.500\nSecond subtitle\n'
    );
  });

  it('starts with WEBVTT header', () => {
    const entries: SubtitleEntry[] = [
      { index: 1, startTime: 0, endTime: 1, text: 'Test' },
    ];

    const vtt = exportToVtt(entries);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
  });

  it('sorts entries by start time', () => {
    const entries: SubtitleEntry[] = [
      { index: 2, startTime: 10, endTime: 15, text: 'Later' },
      { index: 1, startTime: 1, endTime: 5, text: 'Earlier' },
    ];

    const vtt = exportToVtt(entries);
    expect(vtt.indexOf('Earlier')).toBeLessThan(vtt.indexOf('Later'));
  });

  it('uses dot separator for milliseconds (not comma)', () => {
    const entries: SubtitleEntry[] = [
      { index: 1, startTime: 1.5, endTime: 2.75, text: 'Test' },
    ];

    const vtt = exportToVtt(entries);
    expect(vtt).toContain('00:00:01.500 --> 00:00:02.750');
    expect(vtt).not.toContain(',');
  });

  it('returns WEBVTT header with trailing newline for empty entries', () => {
    expect(exportToVtt([])).toBe('WEBVTT\n\n\n');
  });

  it('round-trip: parse VTT -> export VTT -> parse again produces same entries', () => {
    const original = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world

00:00:05.500 --> 00:00:09.250
Multi line
subtitle text`;

    const parsed = parseVtt(original);
    const exported = exportToVtt(parsed);
    const reparsed = parseVtt(exported);

    expect(reparsed).toHaveLength(parsed.length);
    for (let i = 0; i < parsed.length; i++) {
      expect(reparsed[i].startTime).toBe(parsed[i].startTime);
      expect(reparsed[i].endTime).toBe(parsed[i].endTime);
      expect(reparsed[i].text).toBe(parsed[i].text);
    }
  });
});

// ==================== Edge Cases ====================

describe('edge cases', () => {
  it('handles a single entry in SRT', () => {
    const srt = `1
00:00:00,000 --> 00:00:01,000
Only one`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Only one');
  });

  it('handles a single entry in VTT', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:01.000
Only one`;

    const entries = parseVtt(vtt);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Only one');
  });

  it('handles overlapping times in SRT', () => {
    const srt = `1
00:00:01,000 --> 00:00:05,000
First overlapping

2
00:00:03,000 --> 00:00:07,000
Second overlapping`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(2);
    expect(entries[0].endTime).toBeGreaterThan(entries[1].startTime);
  });

  it('handles special characters in text', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
<i>Italic</i> & "quotes" 'apostrophes'

2
00:00:05,000 --> 00:00:08,000
Accented: cafe, naive, resume`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(2);
    expect(entries[0].text).toBe('<i>Italic</i> & "quotes" \'apostrophes\'');
    expect(entries[1].text).toContain('cafe');
  });

  it('handles unicode characters in text', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Korean text here

2
00:00:05,000 --> 00:00:08,000
Japanese text here`;

    const entries = parseSrt(srt);
    expect(entries).toHaveLength(2);
  });

  it('handles zero start time', () => {
    const entries = parseSrt(`1
00:00:00,000 --> 00:00:01,000
At the very start`);

    expect(entries[0].startTime).toBe(0);
  });

  it('cross-format round-trip: SRT -> parse -> export VTT -> parse VTT matches', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello

2
00:00:05,000 --> 00:00:08,000
World`;

    const srtEntries = parseSrt(srt);
    const vttString = exportToVtt(srtEntries);
    const vttEntries = parseVtt(vttString);

    expect(vttEntries).toHaveLength(srtEntries.length);
    for (let i = 0; i < srtEntries.length; i++) {
      expect(vttEntries[i].startTime).toBe(srtEntries[i].startTime);
      expect(vttEntries[i].endTime).toBe(srtEntries[i].endTime);
      expect(vttEntries[i].text).toBe(srtEntries[i].text);
    }
  });

  it('does not mutate the original entries array when exporting', () => {
    const entries: SubtitleEntry[] = [
      { index: 2, startTime: 5, endTime: 8, text: 'Second' },
      { index: 1, startTime: 1, endTime: 4, text: 'First' },
    ];
    const copy = [...entries.map((e) => ({ ...e }))];

    exportToSrt(entries);
    exportToVtt(entries);

    expect(entries).toEqual(copy);
  });

  it('skips SRT entries with empty text after the timestamp line', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000


2
00:00:05,000 --> 00:00:08,000
Has text`;

    const entries = parseSrt(srt);
    // The first entry has whitespace-only text which .trim() makes empty
    // The parser checks `if (text)` so it should skip it
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Has text');
  });
});
