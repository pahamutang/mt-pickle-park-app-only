jest.mock('./supabaseClient', () => ({ supabase: {} }));

import { detectType } from './paymentProofStorage';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('detectType', () => {
  it('recognises PNG, JPEG and WebP by their first bytes', () => {
    expect(detectType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))?.ext).toBe('png');
    expect(detectType(bytes(0xff, 0xd8, 0xff, 0xe0))?.ext).toBe('jpg');
    expect(
      detectType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))?.ext
    ).toBe('webp');
  });

  it('refuses everything else instead of guessing JPEG', () => {
    expect(detectType(bytes())).toBeNull();
    expect(detectType(bytes(0x47, 0x49, 0x46, 0x38))).toBeNull(); // GIF
    expect(detectType(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // PDF
    expect(
      detectType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))
    ).toBeNull(); // RIFF but WAV
  });
});
