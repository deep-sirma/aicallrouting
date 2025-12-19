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
  ScrollView,
} from "react-native";
import {
  sendGreeting,
  sendToN8n,
  resetSession,
  stopCurrentAudio,
} from "./utils/n8nProcessor";
import { transcribeWithWhisper } from "./utils/sttProcessor";
// @ts-ignore - legacy module has different types but works at runtime
import * as FileSystem from "expo-file-system/legacy";

type CallState = "idle" | "incoming" | "active" | "recording" | "processing" | "speaking";

// Get reference to native module
const { TelephonyModule } = NativeModules;

interface ConversationItem {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export default function App() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isProcessingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const hasGreetedRef = useRef(false);
  const [callState, setCallState] = useState<CallState>("idle");
  const [permissionStatus, setPermissionStatus] = useState<string>("checking");
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [rawTelephonyState, setRawTelephonyState] = useState<number | null>(null);
  const [moduleAvailable, setModuleAvailable] = useState<boolean | null>(null);
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [lastTranscription, setLastTranscription] = useState<string>("");
  const [processingStatus, setProcessingStatus] = useState<string>("");

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

  const processAudioChunk = useCallback(async (audioUri: string): Promise<void> => {
    try {
      // Save audio chunk for debugging
      const debugDir = FileSystem.documentDirectory + "debug_recordings/";
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const debugFile = debugDir + `chunk_${timestamp}.m4a`;

      try {
        // Ensure debug directory exists
        const dirInfo = await FileSystem.getInfoAsync(debugDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(debugDir, { intermediates: true });
        }

        // Copy the audio file to debug location
        await FileSystem.copyAsync({ from: audioUri, to: debugFile });
        console.log("=== DEBUG: Audio chunk saved to:", debugFile);
      } catch (saveError) {
        console.log("DEBUG save error:", saveError);
      }

      // Step 1: Transcribe audio using Whisper STT
      setProcessingStatus("Transcribing...");
      setCallState("processing");
      console.log("Processing audio chunk:", audioUri);

      const transcriptionResult = await transcribeWithWhisper(audioUri);

      if (transcriptionResult.error) {
        console.log("Transcription error:", transcriptionResult.error);
        setProcessingStatus("STT error");
        return;
      }

      const transcription = transcriptionResult.text.trim();
      if (!transcription || transcription === '[STT not configured - audio saved]') {
        console.log("No speech detected in chunk");
        setProcessingStatus("No speech detected");
        return;
      }

      console.log("Transcription:", transcription);
      setLastTranscription(transcription);

      // Add user message to conversation
      setConversation(prev => [...prev, {
        role: "user",
        text: transcription,
        timestamp: Date.now()
      }]);

      // Step 2: Send transcribed text to n8n for AI response + TTS
      setProcessingStatus("Getting AI response...");
      isSpeakingRef.current = true;

      const result = await sendToN8n(
        transcription,
        // onStartSpeaking
        () => {
          setCallState("speaking");
          setProcessingStatus("AI Speaking...");
        },
        // onEndSpeaking
        () => {
          isSpeakingRef.current = false;
          setProcessingStatus("");
          setCallState("recording");
        }
      );

      if (result.success) {
        // Add assistant message to conversation
        setConversation(prev => [...prev, {
          role: "assistant",
          text: "[Audio response played]",
          timestamp: Date.now()
        }]);
      } else {
        console.log("n8n error:", result.error);
        setProcessingStatus("AI error");
        isSpeakingRef.current = false;
      }

    } catch (error) {
      console.error("Error processing audio chunk:", error);
      setProcessingStatus("Error");
      isSpeakingRef.current = false;
    }
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

        // Skip duration update while speaking
        if (!isSpeakingRef.current) {
          duration++;
          setRecordingDuration(duration);
        }

        // Process chunk every 5 seconds (only if not speaking)
        if (duration % CHUNK_INTERVAL_SECONDS === 0 && recordingRef.current && !isSpeakingRef.current) {
          try {
            const status = await recordingRef.current.getStatusAsync();
            if (status.isRecording) {
              await recordingRef.current.stopAndUnloadAsync();
              const uri = recordingRef.current.getURI();

              if (uri) {
                console.log("Audio chunk captured:", uri);

                // Process the audio chunk (STT -> n8n -> Audio playback)
                await processAudioChunk(uri);
              }
            }

            // Start new recording (only if call is still active and not speaking)
            const currentState = await getTelephonyState();
            if (currentState === 2 && isProcessingRef.current && !isSpeakingRef.current) {
              const newRecording = new Audio.Recording();
              await newRecording.prepareToRecordAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
              );
              await newRecording.startAsync();
              recordingRef.current = newRecording;
              setIsRecordingActive(true);
              setCallState("recording");
              console.log("New recording chunk started");
            }
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
    await stopCurrentAudio();
    await stopRecording();
    isProcessingRef.current = false;
    isSpeakingRef.current = false;
    setCallState("idle");
    setRecordingDuration(0);
    setProcessingStatus("");
    console.log("Process loop ended");
  }, [getTelephonyState, stopRecording, processAudioChunk]);

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

      // Reset session for new call
      resetSession();
      hasGreetedRef.current = false;
      setConversation([]);
      setLastTranscription("");

      // Stop any existing recording/audio first
      await stopRecording();
      await stopCurrentAudio();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      // Send greeting first (like web app does)
      if (!hasGreetedRef.current) {
        console.log("Sending greeting...");
        setProcessingStatus("Greeting...");
        setCallState("speaking");
        isSpeakingRef.current = true;
        hasGreetedRef.current = true;

        await sendGreeting(
          // onStartSpeaking
          () => {
            console.log("Greeting started");
          },
          // onEndSpeaking
          () => {
            console.log("Greeting finished");
            isSpeakingRef.current = false;
          }
        );

        // Add greeting to conversation
        setConversation([{
          role: "assistant",
          text: "[Greeting played]",
          timestamp: Date.now()
        }]);
      }

      // Start recording
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecordingActive(true);

      setCallState("recording");
      setProcessingStatus("");
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
          }
          // Don't override state while processing/speaking
        } else {
          // IDLE
          if (isProcessingRef.current) {
            console.log("Call ended, stopping processing");
            isProcessingRef.current = false;
            await stopCurrentAudio();
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
      stopCurrentAudio();
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
          text: "Listening...",
          bgColor: "#FFEBEE",
        };
      case "processing":
        return {
          color: "#2196F3",
          icon: "AI",
          text: processingStatus || "Processing...",
          bgColor: "#E3F2FD",
        };
      case "speaking":
        return {
          color: "#9C27B0",
          icon: "TTS",
          text: processingStatus || "AI Speaking...",
          bgColor: "#F3E5F5",
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

        {(callState === "recording" || callState === "processing" || callState === "speaking") && (
          <View style={styles.recordingInfo}>
            <View style={[styles.recordingDot, { backgroundColor: stateConfig.color }]} />
            <Text style={[styles.durationText, { color: stateConfig.color }]}>
              {formatDuration(recordingDuration)}
            </Text>
          </View>
        )}
      </View>

      {/* Conversation Display */}
      {conversation.length > 0 && (
        <View style={styles.conversationCard}>
          <Text style={styles.conversationTitle}>Conversation</Text>
          <ScrollView style={styles.conversationScroll} nestedScrollEnabled>
            {conversation.slice(-6).map((item, index) => (
              <View
                key={index}
                style={[
                  styles.messageRow,
                  item.role === "assistant" ? styles.assistantRow : styles.userRow
                ]}
              >
                <Text style={styles.messageRole}>
                  {item.role === "user" ? "You:" : "AI:"}
                </Text>
                <Text style={styles.messageText} numberOfLines={3}>
                  {item.text}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Last Transcription */}
      {lastTranscription && callState !== "idle" && (
        <View style={styles.transcriptionCard}>
          <Text style={styles.transcriptionLabel}>Last heard:</Text>
          <Text style={styles.transcriptionText} numberOfLines={2}>
            "{lastTranscription}"
          </Text>
        </View>
      )}

      {/* Status Details */}
      <View style={styles.detailsCard}>
        <Text style={styles.detailsTitle}>Status</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Module:</Text>
          <Text style={[styles.detailValue, { color: moduleAvailable ? "#4CAF50" : "#F44336" }]}>
            {moduleAvailable === null ? "..." : moduleAvailable ? "OK" : "N/A"}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Phone:</Text>
          <Text style={styles.detailValue}>
            {rawTelephonyState === 0 ? "Idle" : rawTelephonyState === 1 ? "Ringing" : rawTelephonyState === 2 ? "Active" : "N/A"}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Recording:</Text>
          <Text style={styles.detailValue}>
            {isRecordingActive ? "Yes" : "No"}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>n8n:</Text>
          <Text style={[styles.detailValue, { color: "#4CAF50" }]}>
            Connected
          </Text>
        </View>
      </View>

      <Text style={styles.hint}>
        {permissionStatus === "granted"
          ? "Make or receive a call to start AI assistant"
          : "Please grant permissions to use the app"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    color: "#333",
  },
  statusCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 2,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
  },
  statusBadgeText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 12,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
  },
  recordingInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  durationText: {
    fontSize: 20,
    fontWeight: "bold",
    fontVariant: ["tabular-nums"],
  },
  conversationCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    maxHeight: 150,
  },
  conversationTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  conversationScroll: {
    maxHeight: 110,
  },
  messageRow: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  userRow: {
    backgroundColor: "#E3F2FD",
  },
  assistantRow: {
    backgroundColor: "#F3E5F5",
  },
  messageRole: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#666",
  },
  messageText: {
    fontSize: 12,
    color: "#333",
  },
  transcriptionCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  transcriptionLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  transcriptionText: {
    fontSize: 14,
    color: "#333",
    fontStyle: "italic",
  },
  detailsCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: "#666",
  },
  detailValue: {
    fontSize: 12,
    fontWeight: "500",
    color: "#333",
  },
  hint: {
    textAlign: "center",
    color: "#999",
    fontSize: 12,
    marginTop: "auto",
    marginBottom: 16,
  },
});
