import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

// Native Google / Apple sign-in, exchanged for a Supabase session via
// signInWithIdToken. Both need a dev or EAS build — neither native module
// exists in Expo Go.
//
// Each function resolves to:
//   'signed-in'  — Supabase session is set; onAuthStateChange takes it from here
//   'cancelled'  — the user dismissed the native sheet; show nothing
// and throws on any real failure so callers can surface the message.

export type SocialSignInResult = 'signed-in' | 'cancelled';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

let googleConfigured = false;

function configureGoogle() {
  if (googleConfigured) return;
  if (!googleWebClientId) {
    throw new Error('Google sign-in is not configured yet (missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).');
  }
  GoogleSignin.configure({
    // The *web* client ID is what makes Google mint an ID token whose
    // audience Supabase accepts — the Android/iOS client IDs only identify
    // the app to Google.
    webClientId: googleWebClientId,
    iosClientId: googleIosClientId || undefined,
  });
  googleConfigured = true;
}

export async function signInWithGoogle(): Promise<SocialSignInResult> {
  configureGoogle();
  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return 'cancelled';

    const idToken = response.data.idToken;
    if (!idToken) throw new Error('Google did not return an ID token.');

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) throw error;
    return 'signed-in';
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return 'cancelled';
    throw e;
  }
}

// Sign in with Apple is only offered on iOS — App Store Guideline 4.8
// requires it there alongside Google; Google Play has no equivalent rule.
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithApple(): Promise<SocialSignInResult> {
  // Apple embeds the SHA-256 of the nonce in its ID token; Supabase gets the
  // raw value and re-hashes it to check the token wasn't replayed.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw e;
  }

  if (!credential.identityToken) throw new Error('Apple did not return an identity token.');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;

  // Apple sends the user's name only on the very first authorization and
  // never puts it in the ID token, so store it now or it's gone for good.
  // CompleteProfileScreen uses it to prefill the username.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ');
  if (fullName) {
    await supabase.auth.updateUser({ data: { full_name: fullName } });
  }

  return 'signed-in';
}

// Clears the cached Google account so the next sign-in shows the account
// picker again instead of silently reusing the last one. Best-effort.
export async function signOutOfSocialProviders() {
  if (!googleConfigured) return;
  try {
    await GoogleSignin.signOut();
  } catch {
    // Not signed in with Google, or the native module is unavailable.
  }
}
