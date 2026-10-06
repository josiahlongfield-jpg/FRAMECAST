import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from "expo-camera";
import { router } from "expo-router";
import { queueRecording } from "@/lib/uploads";
import { colors } from "@/lib/theme";

const MAX_DURATION_S = 4 * 60 * 60;

export default function Record() {
  const camera = useRef<CameraView>(null);
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>("front");
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const startedAt = useRef(0);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => clearInterval(t);
  }, [state]);

  if (!camPerm || !micPerm) return <View style={styles.black} />;
  if (!camPerm.granted || !micPerm.granted) {
    return (
      <View style={[styles.black, styles.center]}>
        <Text style={styles.permText}>SureFrame needs your camera and microphone to record.</Text>
        <Pressable style={styles.permButton} onPress={async () => { await requestCam(); await requestMic(); }}>
          <Text style={styles.permButtonText}>Allow access</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}><Text style={styles.cancel}>Cancel</Text></Pressable>
      </View>
    );
  }

  async function start() {
    if (!camera.current || !ready) return;
    setError(undefined);
    setState("recording");
    startedAt.current = Date.now();
    try {
      const result = await camera.current.recordAsync({ maxDuration: MAX_DURATION_S });
      const durationMs = Date.now() - startedAt.current;
      if (!result?.uri) throw new Error("Recording failed");
      setState("uploading");
      const id = await queueRecording(result.uri, durationMs, setProgress);
      router.replace(`/v/${id}?new=1`);
    } catch (e) {
      setError(`${(e as Error).message}. Your recording is saved and will finish uploading next time you open the app.`);
      setState("idle");
    }
  }

  const s = Math.floor(elapsed / 1000);

  return (
    <View style={styles.black}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing={facing}
        mode="video"
        videoQuality="1080p"
        mirror={facing === "front"}
        onCameraReady={() => setReady(true)}
      />
      <View style={styles.top}>
        {state === "recording" ? (
          <View style={styles.pill}><View style={styles.dot} /><Text style={styles.pillText}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</Text></View>
        ) : (
          <Pressable onPress={() => router.back()} disabled={state === "uploading"}><Text style={styles.cancel}>Close</Text></Pressable>
        )}
        {state === "idle" && (
          <Pressable onPress={() => setFacing((f) => (f === "front" ? "back" : "front"))}><Text style={styles.cancel}>Flip</Text></Pressable>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.bottom}>
        {state === "uploading" ? (
          <View style={styles.uploading}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.pillText}>Uploading {Math.round(progress * 100)}%</Text>
          </View>
        ) : (
          <Pressable
            accessibilityLabel={state === "recording" ? "Stop recording" : "Start recording"}
            onPress={() => (state === "recording" ? camera.current?.stopRecording() : start())}
            style={styles.shutter}
          >
            <View style={state === "recording" ? styles.stopSquare : styles.recDot} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  permText: { color: "#fff", fontSize: 17, textAlign: "center" },
  permButton: { backgroundColor: colors.brand, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  permButtonText: { color: "#fff", fontWeight: "700" },
  top: { position: "absolute", top: 60, left: 20, right: 20, flexDirection: "row", justifyContent: "space-between" },
  cancel: { color: "#fff", fontSize: 16, fontWeight: "600" },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,.6)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  pillText: { color: "#fff", fontWeight: "600" },
  error: { position: "absolute", top: 110, left: 20, right: 20, color: "#fff", backgroundColor: "rgba(220,38,38,.9)", padding: 12, borderRadius: 10 },
  bottom: { position: "absolute", bottom: 50, left: 0, right: 0, alignItems: "center" },
  shutter: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  recDot: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.danger },
  stopSquare: { width: 30, height: 30, borderRadius: 6, backgroundColor: colors.danger },
  uploading: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "rgba(0,0,0,.6)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
});
