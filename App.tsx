import InCallManager from "react-native-incall-manager";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  NativeModules,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

type CallState = "idle" | "incoming" | "active" | "recording";

// Get reference to native module
const { TelephonyModule } = NativeModules;

export default function App() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isProcessingRef = useRef(false);
  const [callState, setCallState] = useState<CallState>("idle");
  const [permissionStatus, setPermissionStatus] = useState<string>("checking");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [rawTelephonyState, setRawTelephonyState] = useState<number | null>(null);
  const [moduleAvailable, setModuleAvailable] = useState<boolean | null>(null);
  const [isRecordingActive, setIsRecordingActive] = useState(false);

  const stopRecording = useCallback(async () => {
    if (recordingRef.current) {
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording) {
          await recordingRef.current.stopAndUnloadAsync();
        }
      } catch (error) {
        // Ignore errors when stopping - recorder may already be stopped
      }
      recordingRef.current = null;
      setIsRecordingActive(false);
    }
  }, []);

  const getTelephonyState = useCallback(async (): Promise<number> => {
    try {
      if (TelephonyModule?.getCallState) {
        setModuleAvailable(true);
        const state = await TelephonyModule.getCallState();
        setRawTelephonyState(state);
        return state;
      } else {
        setModuleAvailable(false);
      }
    } catch (e) {
      setModuleAvailable(false);
    }
    return 0; // IDLE
  }, []);

  const processLoop = useCallback(async () => {
    const CHUNK_INTERVAL_SECONDS = 5;
    let duration = 0;

    console.log("Process loop started");

    while (isProcessingRef.current) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check if call is still active
        const telephonyState = await getTelephonyState();
        if (telephonyState !== 2) { // Not OFFHOOK
          console.log("Call ended (state:", telephonyState, ")");
          break;
        }

        duration++;
        setRecordingDuration(duration);

        // Process chunk every 5 seconds
        if (duration % CHUNK_INTERVAL_SECONDS === 0 && recordingRef.current) {
          try {
            const status = await recordingRef.current.getStatusAsync();
            if (status.isRecording) {
              await recordingRef.current.stopAndUnloadAsync();
              const uri = recordingRef.current.getURI();
              if (uri) {
                console.log("Audio chunk captured:", uri);
                // TODO: Process with Whisper/TensorFlow
              }
            }

            // Start new recording
            const newRecording = new Audio.Recording();
            await newRecording.prepareToRecordAsync(
              Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            await newRecording.startAsync();
            recordingRef.current = newRecording;
            console.log("New recording chunk started");
          } catch (chunkError) {
            console.error("Error processing chunk:", chunkError);
          }
        }
      } catch (error) {
        console.error("Error in process loop:", error);
        break;
      }
    }

    // Cleanup
    await stopRecording();
    isProcessingRef.current = false;
    setCallState("idle");
    setRecordingDuration(0);
    console.log("Process loop ended");
  }, [getTelephonyState, stopRecording]);

  const startAIProcessing = useCallback(async () => {
    // Prevent multiple starts
    if (isProcessingRef.current) {
      console.log("Already processing, skipping start");
      return;
    }

    try {
      console.log("Starting AI processing...");
      isProcessingRef.current = true;
      setCallState("active");

      // Stop any existing recording first
      await stopRecording();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecordingActive(true);

      setCallState("recording");
      console.log("Recording started successfully");

      // Start processing loop (don't await - run in background)
      processLoop();
    } catch (error) {
      console.error("Error starting AI processing:", error);
      isProcessingRef.current = false;
      setCallState("idle");
      await stopRecording();
    }
  }, [stopRecording, processLoop]);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    let mounted = true;

    const init = async () => {
      // Request permissions first
      const permissionsGranted = await requestPermissions();
      if (!permissionsGranted) {
        setPermissionStatus("denied");
        console.log("Required permissions not granted");
        return;
      }
      setPermissionStatus("granted");

      InCallManager.start({ media: "audio", auto: true });
      InCallManager.setForceSpeakerphoneOn(true);

      // Start polling for call state
      pollInterval = setInterval(async () => {
        if (!mounted) return;

        const telephonyState = await getTelephonyState();

        // Map telephony state to call state
        if (telephonyState === 1) {
          setCallState("incoming");
        } else if (telephonyState === 2) {
          // Call is active
          if (!isProcessingRef.current) {
            await startAIProcessing();
          } else {
            setCallState("recording");
          }
        } else {
          // IDLE
          if (isProcessingRef.current) {
            console.log("Call ended, stopping processing");
            isProcessingRef.current = false;
            await stopRecording();
            setCallState("idle");
            setRecordingDuration(0);
          }
        }
      }, 1000);
    };

    init();

    return () => {
      mounted = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      isProcessingRef.current = false;
      stopRecording();
    };
  }, [getTelephonyState, startAIProcessing, stopRecording]);

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS === "android") {
      try {
        const grants = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        ]);

        const allGranted = Object.values(grants).every(
          (permission) => permission === PermissionsAndroid.RESULTS.GRANTED
        );

        if (!allGranted) {
          console.log("Some permissions were denied:", grants);
          return false;
        }

        console.log("All permissions granted");
        return true;
      } catch (err) {
        console.warn("Permission request error:", err);
        return false;
      }
    }

    return true;
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getStateConfig = () => {
    switch (callState) {
      case "incoming":
        return {
          color: "#FFA500",
          icon: "INCOMING",
          text: "Incoming Call...",
          bgColor: "#FFF3E0",
        };
      case "active":
        return {
          color: "#4CAF50",
          icon: "CONNECTED",
          text: "Call Connected",
          bgColor: "#E8F5E9",
        };
      case "recording":
        return {
          color: "#F44336",
          icon: "REC",
          text: "Recording & Processing",
          bgColor: "#FFEBEE",
        };
      default:
        return {
          color: "#9E9E9E",
          icon: "IDLE",
          text: "Waiting for call...",
          bgColor: "#FAFAFA",
        };
    }
  };

  const stateConfig = getStateConfig();

  return (
    <View style={[styles.container, { backgroundColor: stateConfig.bgColor }]}>
      <Text style={styles.title}>AI-EPABX</Text>

      {/* Status Indicator */}
      <View style={[styles.statusCard, { borderColor: stateConfig.color }]}>
        <View style={[styles.statusBadge, { backgroundColor: stateConfig.color }]}>
          <Text style={styles.statusBadgeText}>{stateConfig.icon}</Text>
        </View>
        <Text style={[styles.statusText, { color: stateConfig.color }]}>
          {stateConfig.text}
        </Text>

        {callState === "recording" && (
          <View style={styles.recordingInfo}>
            <View style={styles.recordingDot} />
            <Text style={styles.durationText}>
              {formatDuration(recordingDuration)}
            </Text>
          </View>
        )}
      </View>

      {/* Permission Status */}
      <View style={styles.infoSection}>
        <Text style={styles.infoLabel}>Permissions:</Text>
        <Text
          style={[
            styles.infoValue,
            { color: permissionStatus === "granted" ? "#4CAF50" : "#F44336" },
          ]}
        >
          {permissionStatus === "granted" ? "Granted" : permissionStatus === "denied" ? "Denied" : "Checking..."}
        </Text>
      </View>

      {/* Call State Details */}
      <View style={styles.detailsCard}>
        <Text style={styles.detailsTitle}>Status Details</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Native Module:</Text>
          <Text style={[styles.detailValue, { color: moduleAvailable ? "#4CAF50" : "#F44336" }]}>
            {moduleAvailable === null ? "Checking..." : moduleAvailable ? "Available" : "Not Found"}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Raw State:</Text>
          <Text style={styles.detailValue}>
            {rawTelephonyState === null ? "N/A" : `${rawTelephonyState} (${rawTelephonyState === 0 ? "IDLE" : rawTelephonyState === 1 ? "RINGING" : "OFFHOOK"})`}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Call State:</Text>
          <Text style={styles.detailValue}>{callState.toUpperCase()}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Processing:</Text>
          <Text style={styles.detailValue}>{isProcessingRef.current ? "Yes" : "No"}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Recording:</Text>
          <Text style={styles.detailValue}>
            {isRecordingActive ? "Active" : "Inactive"}
          </Text>
        </View>
      </View>

      <Text style={styles.hint}>
        Make or receive a phone call to test AI processing
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 30,
    color: "#333",
  },
  statusCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 2,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
  },
  statusBadgeText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 14,
  },
  statusText: {
    fontSize: 18,
    fontWeight: "600",
  },
  recordingInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#F44336",
    marginRight: 8,
  },
  durationText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#F44336",
    fontVariant: ["tabular-nums"],
  },
  infoSection: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  infoLabel: {
    fontSize: 16,
    color: "#666",
    marginRight: 8,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  detailsCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE",
  },
  detailLabel: {
    fontSize: 14,
    color: "#666",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  hint: {
    textAlign: "center",
    color: "#999",
    fontSize: 14,
    marginTop: "auto",
    marginBottom: 20,
  },
});
