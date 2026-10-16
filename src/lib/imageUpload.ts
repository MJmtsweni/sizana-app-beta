import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import { compressImage } from './mediaCompression';

type PickOptions = {
  aspect?: [number, number];
  allowsEditing?: boolean;
  quality?: number;
};

// Wraps the permission check + launch call every screen was re-implementing
// slightly differently (some checked permission first, some didn't; some
// used the string literal mediaType, some the deprecated enum). Returns the
// local uri, or null if the user cancelled or denied permission.
export async function pickImage(options: PickOptions = {}): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: options.allowsEditing ?? true,
    aspect: options.aspect,
    quality: options.quality ?? 0.7,
  });

  if (result.canceled || !result.assets[0]?.uri) return null;
  return result.assets[0].uri;
}

type UploadOptions = {
  bucket?: string;
  // Prefixed onto the generated filename — pass something identifying (a
  // business/user id, a purpose like "avatar") so files stay traceable in
  // the bucket without needing a real path hierarchy.
  fileNamePrefix?: string;
  maxDimension?: number;
};

// Compresses and uploads a local image uri to Supabase Storage, returning
// its public URL. Every screen doing this by hand had subtly different
// (and in one case bug-fixed-in-a-comment) FormData construction — this is
// the one correct version, matching EditBusinessModalScreen's fix for the
// 0-byte-upload issue fetch().blob() had on RN.
export async function uploadImageToStorage(localUri: string, options: UploadOptions = {}): Promise<string> {
  const bucket = options.bucket ?? 'Listings';
  const compressed = await compressImage(localUri, { maxDimension: options.maxDimension });
  const prefix = options.fileNamePrefix ? `${options.fileNamePrefix}-` : '';
  const fileName = `${prefix}${Date.now()}.jpg`;

  const formData = new FormData();
  formData.append('file', {
    uri: compressed.uri,
    name: fileName,
    type: 'image/jpeg',
  } as any);

  const { error } = await supabase.storage.from(bucket).upload(fileName, formData);
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
}

// Composes both for the common case: pick, then upload immediately. Returns
// null if the user cancelled/denied — callers that need to pick now and
// upload later (e.g. as part of a larger form submit) should call
// pickImage()/uploadImageToStorage() separately instead.
export async function pickAndUploadImage(
  pickOptions: PickOptions = {},
  uploadOptions: UploadOptions = {}
): Promise<string | null> {
  const localUri = await pickImage(pickOptions);
  if (!localUri) return null;
  return uploadImageToStorage(localUri, uploadOptions);
}
