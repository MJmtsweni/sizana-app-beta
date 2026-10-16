// Extends app.json with config that depends on environment variables.
//
// Google Sign-In on iOS needs the reversed iOS client ID registered as a URL
// scheme, and the plugin refuses to run without it. Until
// EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set the plugin is skipped, so builds
// keep working — the Google button just reports it isn't configured.
module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!iosClientId) {
    console.warn('[app.config] EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID not set — skipping Google Sign-In iOS URL scheme.');
    return config;
  }
  // "1234-abc.apps.googleusercontent.com" -> "com.googleusercontent.apps.1234-abc"
  const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`;
  return {
    ...config,
    plugins: [...config.plugins, ['@react-native-google-signin/google-signin', { iosUrlScheme }]],
  };
};
