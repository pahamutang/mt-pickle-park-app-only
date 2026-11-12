import { decode } from 'base64-arraybuffer';
import { supabase } from './supabaseClient';

const BUCKET = 'payment-proofs';

// Thrown when the picked file itself is unusable (not a JPG/PNG/WebP, or too
// big). `message` is safe to show the player.
export class ProofRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProofRejectedError';
  }
}

const MAX_PROOF_BYTES = 10 * 1024 * 1024;

// Identify the image from its first bytes (its "magic number") instead of
// trusting the file name, so a GIF/PDF/renamed file is refused rather than
// uploaded under a made-up type.
export function detectType(bytes: Uint8Array): { ext: string; contentType: string } | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // "WEBP"
  ) {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return null;
}

// Uploads a player's GCash payment screenshot into their own folder of the
// private payment-proofs bucket and returns its storage path.
export async function uploadPaymentProof(
  userId: string,
  base64: string,
  _sourceUri?: string // kept so existing callers still compile; the real type is read from the bytes
): Promise<string> {
  const buffer = decode(base64);
  const type = detectType(new Uint8Array(buffer));
  if (!type) {
    throw new ProofRejectedError('Please attach a JPG, PNG or WebP screenshot of your payment.');
  }
  if (buffer.byteLength > MAX_PROOF_BYTES) {
    throw new ProofRejectedError('That screenshot is too large (max 10 MB). Please choose a smaller one.');
  }
  const { ext, contentType } = type;
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

// Best-effort cleanup when the reservation fails after the upload succeeded.
export async function deletePaymentProof(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn('Failed to delete payment proof', error);
}

// The bucket is private, so the owner views screenshots through short-lived
// signed links instead of public URLs.
export async function getPaymentProofUrls(paths: string[]): Promise<string[]> {
  const urls: string[] = [];
  for (const path of paths) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
    if (!error && data?.signedUrl) urls.push(data.signedUrl);
  }
  return urls;
}

// Removes several screenshots at once (used when the owner approves a
// payment). Returns true only if every file was really deleted.
export async function deletePaymentProofs(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const { data, error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    console.warn('Failed to delete payment proofs', error);
    return false;
  }
  return (data?.length ?? 0) >= paths.length;
}
