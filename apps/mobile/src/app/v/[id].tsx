import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { api, API_URL, getSession, shareUrl, type Video } from "@/lib/api";
import { colors } from "@/lib/theme";

export default function Watch() {
  const { id, new: isNew } = useLocalSearchParams<{ id: string; new?: string }>();
  const [video, setVideo] = useState<Video>();
  const [headers, setHeaders] = useState<Record<string, string>>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api<{ video: Video }>(`/api/videos/${id}`).then((r) => setVideo(r.video)).catch((e) => setError(e.message));
    getSession().then((s) => setHeaders(s ? { Cookie: `${s.cookie}=${s.token}` } : {}));
  }, [id]);

  const source = video && headers ? { uri: video.hlsUrl ?? API_URL + video.rawUrl, headers } : null;
  const player = useVideoPlayer(source, (p) => {
    p.play();
  });

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!video) return <ActivityIndicator style={{ marginTop: 80 }} />;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: video.title }} />
      <VideoView player={player} style={styles.player} allowsPictureInPicture nativeControls contentFit="contain" />
      <View style={styles.body}>
        {isNew ? <Text style={styles.ready}>Your video is ready to share.</Text> : null}
        <Text style={styles.title}>{video.title}</Text>
        <Text style={styles.meta}>{new Date(video.createdAt).toLocaleString()} · {video.viewCount} views</Text>
        <Pressable style={styles.share} onPress={() => Share.share({ message: shareUrl(video.id), url: shareUrl(video.id) })}>
          <Text style={styles.shareText}>Share link</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  player: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  body: { padding: 20, gap: 6 },
  ready: { color: colors.ok, fontWeight: "600", marginBottom: 6 },
  title: { fontSize: 20, fontWeight: "700", color: colors.ink },
  meta: { color: colors.muted },
  share: { marginTop: 16, backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  shareText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: colors.danger, padding: 20 },
});
