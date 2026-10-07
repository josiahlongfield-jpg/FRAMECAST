import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { api, getSession, signIn, signOut, type Video } from "@/lib/api";
import { resumePending } from "@/lib/uploads";
import { colors } from "@/lib/theme";

const fmt = (ms: number | null) => {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function Home() {
  const [signedIn, setSignedIn] = useState<boolean>();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const session = await getSession();
      setSignedIn(!!session);
      if (!session) return;
      await resumePending().catch(() => {});
      const { videos } = await api<{ videos: Video[] }>("/api/videos");
      setVideos(videos);
    } catch (e) {
      setError((e as Error).message);
      setSignedIn(!!(await getSession()));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (signedIn === undefined) return <ActivityIndicator style={{ marginTop: 80 }} />;

  if (!signedIn) {
    return (
      <View style={styles.welcome}>
        <View style={styles.logo}><Text style={styles.logoText}>▶</Text></View>
        <Text style={styles.h1}>Video messages that survive a crash.</Text>
        <Text style={styles.sub}>Record on your phone, share a link instantly, and pick up where you left off on the web.</Text>
        <Pressable style={styles.primary} onPress={async () => (await signIn()) && load()}>
          <Text style={styles.primaryText}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={videos}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
        ListEmptyComponent={
          loading ? null : <Text style={[styles.sub, { textAlign: "center", marginTop: 60 }]}>No videos yet. Tap record to make your first one.</Text>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/v/${item.id}`)} style={styles.card}>
            <View style={styles.thumb}>
              {item.thumbnailUrl ? <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFill} /> : null}
              {item.durationMs ? <Text style={styles.duration}>{fmt(item.durationMs)}</Text> : null}
            </View>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.meta}>
              {new Date(item.createdAt).toLocaleDateString()} · {item.viewCount} {item.viewCount === 1 ? "view" : "views"}
            </Text>
          </Pressable>
        )}
      />
      <Pressable style={styles.fab} onPress={() => router.push("/record")} accessibilityLabel="New recording">
        <View style={styles.fabDot} />
      </Pressable>
      <Pressable onPress={async () => { await signOut(); setSignedIn(false); }} style={styles.signOut}>
        <Text style={styles.meta}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  welcome: { flex: 1, justifyContent: "center", padding: 28, gap: 16 },
  logo: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 24 },
  h1: { fontSize: 30, fontWeight: "700", color: colors.ink },
  sub: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  primary: { backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 12 },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 10, borderWidth: 1, borderColor: colors.line },
  thumb: { aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: "#0f172a", overflow: "hidden" },
  duration: { position: "absolute", right: 8, bottom: 8, color: "#fff", backgroundColor: "rgba(0,0,0,.7)", paddingHorizontal: 6, borderRadius: 4, fontSize: 12 },
  title: { marginTop: 10, fontSize: 16, fontWeight: "600", color: colors.ink },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  error: { color: colors.danger, marginBottom: 8 },
  fab: { position: "absolute", bottom: 40, alignSelf: "center", width: 76, height: 76, borderRadius: 38, backgroundColor: "#fff", borderWidth: 4, borderColor: colors.line, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  fabDot: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.danger },
  signOut: { position: "absolute", bottom: 64, right: 24 },
});
