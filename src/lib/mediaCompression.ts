import { Image } from 'react-native';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Video as VideoCompressor } from 'react-native-compressor';

// Longest-edge cap for anything users post — well above what any phone
// screen or our listing/forum image views actually render, so it's a free
// storage/bandwidth win with no visible quality loss.
const DEFAULT_MAX_IMAGE_DIMENSION = 1600;
const DEFAULT_IMAGE_QUALITY = 0.7;

// Skip re-encoding files already smaller than this — recompressing a tiny
// avatar someone already cropped down just burns CPU for no savings.
const MIN_IMAGE_BYTES_TO_COMPRESS = 150 * 1024;
const MIN_VIDEO_BYTES_TO_COMPRESS = 2 * 1024 * 1024;

export type CompressedImage = { uri: string; width: number; height: number };

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function getFileSize(uri: string): number {
  try {
    const file = new File(uri);
    // A missing/unreadable file (or a content:// URI the File class can't
    // stat) reports 0 — treat that as "unknown size" and let compression
    // proceed rather than skip it.
    return file.exists && file.size > 0 ? file.size : Infinity;
  } catch {
    return Infinity;
  }
}

/**
 * Resizes (if needed) and re-encodes an image as JPEG to cut upload size
 * before it goes to Supabase Storage. Safe to call on any picked image —
 * no-ops (returns the original) if it's already small or fails to decode.
 */
export async function compressImage(
  uri: string,
  options?: { maxDimension?: number; quality?: number }
): Promise<CompressedImage> {
  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_IMAGE_DIMENSION;
  const quality = options?.quality ?? DEFAULT_IMAGE_QUALITY;

  try {
    const fileSize = getFileSize(uri);
    const { width, height } = await getImageSize(uri);
    const longestEdge = Math.max(width, height);

    if (fileSize < MIN_IMAGE_BYTES_TO_COMPRESS && longestEdge <= maxDimension) {
      return { uri, width, height };
    }

    const scale = Math.min(1, maxDimension / longestEdge);
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const context = ImageManipulator.manipulate(uri);
    if (scale < 1) context.resize({ width: targetWidth, height: targetHeight });
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({ compress: quality, format: SaveFormat.JPEG });

    return { uri: result.uri, width: result.width, height: result.height };
  } catch (e) {
    console.warn('Image compression failed, uploading original:', e);
    const fallback = await getImageSize(uri).catch(() => ({ width: 0, height: 0 }));
    return { uri, ...fallback };
  }
}

/**
 * Re-encodes a video at a reduced bitrate/resolution before upload. Safe to
 * call on any picked video — no-ops (returns the original uri) if it's
 * already small or the native compressor fails.
 */
export async function compressVideo(uri: string, options?: { maxSize?: number }): Promise<string> {
  const maxSize = options?.maxSize ?? 1280;

  try {
    const fileSize = getFileSize(uri);
    if (fileSize < MIN_VIDEO_BYTES_TO_COMPRESS) return uri;

    return await VideoCompressor.compress(uri, {
      compressionMethod: 'auto',
      maxSize,
    });
  } catch (e) {
    console.warn('Video compression failed, uploading original:', e);
    return uri;
  }
}

/**
 * Dispatches to compressImage/compressVideo based on a file extension or
 * explicit mime-type hint — convenient when a single upload flow can
 * receive either (e.g. a picker with mediaTypes set to 'all').
 */
export async function compressMedia(
  uri: string,
  mediaType?: 'image' | 'video'
): Promise<{ uri: string; width?: number; height?: number }> {
  const type = mediaType ?? (/\.(mp4|mov|m4v|webm|3gp)$/i.test(uri) ? 'video' : 'image');
  if (type === 'video') {
    const compressedUri = await compressVideo(uri);
    return { uri: compressedUri };
  }
  return compressImage(uri);
}
