/**
 * ASS fallback for animated subtitles — tag generation (rendering is covered
 * by exportFidelityAnimation.integration.test.ts).
 */

import { describe, it, expect } from 'vitest';
import { buildAssContent, type SubClip } from '../ass-subtitles';

const style = {
  fontSize: 24, fontFamily: 'Arial', fontColor: '#FFFFFF', backgroundColor: '#000000',
  backgroundOpacity: 1, position: { x: 50, y: 50 }, animationColor: '#FF0000',
};

const dialogues = (subs: SubClip[]) =>
  buildAssContent(subs, 320, 240).split('\n').filter((l) => l.startsWith('Dialogue:'));

describe('buildAssContent — animation', () => {
  it('keeps a single \\pos event for a static subtitle (box in the outline colour)', () => {
    const [d] = dialogues([{ startTime: 0, endTime: 1, text: 'hi', style }]);
    expect(d).toContain('\\pos(160,120)');
    expect(d).toContain('\\3c&H00000000&');
    expect(d).not.toContain('\\t(');
  });

  it('splits at keyframes and animates position / scale / opacity linearly', () => {
    const ds = dialogues([{
      startTime: 1, endTime: 3, text: 'hi', style,
      animationKeyframes: [
        { time: 0, property: 'x', value: 0 }, { time: 1, property: 'x', value: 100 },
        { time: 0, property: 'scale', value: 1 }, { time: 2, property: 'scale', value: 2 },
        { time: 0, property: 'opacity', value: 0 }, { time: 1, property: 'opacity', value: 1 },
      ],
    }]);
    expect(ds).toHaveLength(2);
    expect(ds[0]).toMatch(/^Dialogue: 0,0:00:01\.00,0:00:02\.00,/);
    expect(ds[0]).toContain('\\move(0,120,320,120)');
    expect(ds[0]).toContain('\\fscx100\\fscy100');
    expect(ds[0]).toMatch(/\\t\(\\fscx150\\fscy150\\1a&H00&\\3a&H00&\\4a&H00&\)/);
    expect(ds[0]).toContain('\\1a&HFF&');
    expect(ds[1]).toContain('\\pos(320,120)');
  });

  it('eased keyframe segments are split into ≤ 0.2 s pieces', () => {
    const ds = dialogues([{
      startTime: 0, endTime: 1, text: 'hi', style,
      animationKeyframes: [{ time: 0, property: 'y', value: 0, easing: 'ease-in' }, { time: 1, property: 'y', value: 100 }],
    }]);
    expect(ds).toHaveLength(5);
  });

  it('highlight / typewriter / fade-word / scale become inline \\t steps on the preview schedule', () => {
    const [hl] = dialogues([{ startTime: 0, endTime: 2, text: 'a b', style: { ...style, animation: 'highlight' } }]);
    // word 0 highlighted from the start, word 1 at p = 1/2 → 1000 ms.
    expect(hl).toContain('{\\1c&H0000FF&}a');
    expect(hl).toContain('{\\1c&HFFFFFF&\\t(1000,1000,\\1c&H0000FF&)}b');

    const [tw] = dialogues([{ startTime: 0, endTime: 1, text: 'ab', style: { ...style, animation: 'typewriter' } }]);
    // char i visible from (i + 1)/n of the clip.
    expect(tw).toContain('{\\1a&HFF&\\t(500,500,\\1a&H00&)}a');
    expect(tw).toContain('{\\1a&HFF&}b');

    const [fw] = dialogues([{ startTime: 0, endTime: 2, text: 'a b', style: { ...style, animation: 'fade-word' } }]);
    expect(fw).toContain('{\\1a&HFF&\\t(1000,2000,\\1a&H00&)}b');

    const [sc] = dialogues([{ startTime: 0, endTime: 2, text: 'a b', style: { ...style, animation: 'scale' } }]);
    expect(sc).toContain('\\t(1000,1000,\\fscx130\\fscy130\\1c&H0000FF&)}b');
  });

  it('slide-up rises from 30 px below over the first third and fades in over the first quarter', () => {
    const [d] = dialogues([{ startTime: 0, endTime: 3, text: 'hi', style: { ...style, animation: 'slide-up' } }]);
    expect(d).toContain('\\move(160,150,160,120,0,1000)');
    expect(d).toContain('\\1a&HFF&\\t(0,750,\\1a&H00&)');
  });
});
