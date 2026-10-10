import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { colors } from '@/theme';

/** Video id from a youtube.com/watch, youtu.be, /shorts/ or /embed/ link; null for anything else. */
export function youtubeVideoId(url: string | null | undefined) {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m ? m[1] : null;
}

// YouTube refuses embeds without a referrer (error 153); an https:// + app id one is accepted.
const appId =
  Constants.expoConfig?.ios?.bundleIdentifier ?? Constants.expoConfig?.android?.package ?? 'app';
const REFERER = `https://${appId}`;

/** Inline YouTube embed that starts playing right away. */
export function YoutubePlayer({ videoId }: { videoId: string }) {
  return (
    <View style={styles.frame}>
      <WebView
        source={{
          uri: `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`,
          headers: { Referer: REFERER },
        }}
        style={styles.web}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: colors.background },
});
