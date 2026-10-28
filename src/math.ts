export const TAU = Math.PI * 2;
export const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t: number) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const angleLerp = (a: number, b: number, t: number) => a + angleDelta(a, b) * t;
export class Random {
  constructor(public seed = 37621) {}
  next() { let t = this.seed += 0x6d2b79f5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  range(a: number, b: number) { return lerp(a, b, this.next()); }
}
