import InCallManager from "react-native-incall-manager";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from "react-native";
// @ts-ignore - legacy module has different types but works at runtime
import * as FileSystem from "expo-file-system/legacy";
import { websocketManager } from "./utils/websocketManager";

type CallState = "idle" | "incoming" | "active" | "recording" | "processing" | "speaking";

// Get reference to native module
const { TelephonyModule, CallAudioModule } = NativeModules;

interface ConversationItem {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export default function App() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isProcessingRef = useRef(false);
  const isSpeakingRef = useRef(false);

  // State refs to prevent race conditions
  const answeringRef = useRef(false);

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

  // Helper to convert ArrayBuffer to Base64 for Native Module
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const processAudioChunk = useCallback(async (audioUri: string): Promise<void> => {
    try {
      console.log("Processing audio chunk:", audioUri);

      // Read audio file as base64
      const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 string to ArrayBuffer for WebSocketManager
      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Send to WebSocket
      if (websocketManager.isConnectionActive()) {
        setProcessingStatus("Sending audio...");
        setCallState("speaking"); // Or "processing" - speaking is fine for UI

        await websocketManager.sendAudioChunk({
          data: bytes.buffer,
          timestamp: Date.now(),
          format: 'mp3', // Note: AAC/M4A is usually what expo-av produces, but backend might just need 'mp3' or 'audio'
          sampleRate: 44100,
          channels: 1
        });
        console.log("Audio chunk sent to WebSocket");
      } else {
        console.warn("WebSocket not connected, skipping chunk");
      }

      const startAIProcessing = useCallback(async () => {
        try {
          console.log("Starting AI processing (WebSocket Mode)...");
          isProcessingRef.current = true;
          setCallState("active");
          setConversation([]);
          setLastTranscription("");

          // 1. Connect WebSocket
          const sessionId = `session_${Date.now()}`;
          setProcessingStatus("Connecting...");

          await websocketManager.connect(sessionId);

          // Define audio handler
          const handleNativeAudioChunk = async (base64Data: string) => {
            if (websocketManager.isConnectionActive()) {
              setCallState("speaking");
              // Send directly - data is already base64 PCM 16bit 16kHz
              await websocketManager.sendAudioChunk({
                data: base64Data, // Updated interface to accept string for cleaner flow
                format: 'pcm16',
                sampleRate: 16000,
                channels: 1,
                timestamp: Date.now()
              });
            }
          };

          // 2. Setup Native Listener for Mic
          const eventEmitter = new NativeEventEmitter(NativeModules.CallAudioModule || NativeModules.TelephonyModule); // Fallback safe
          const audioSub = eventEmitter.addListener('onAudioChunk', handleNativeAudioChunk);

          // Setup Callbacks (Receiving)
          websocketManager.setCallbacks({
            onConnected: () => {
              console.log("WS Connected");
              setProcessingStatus("Connected");
            },
            onTranscription: (text) => {
              setLastTranscription(text);
              setConversation(prev => [...prev.slice(-5), { role: 'user', text, timestamp: Date.now() }]);
            },
            onAudioResponse: async (audioData: ArrayBuffer) => {
              console.log(`Rx Audio: ${audioData.byteLength} bytes`);
              setCallState("speaking");
              if (CallAudioModule?.writePCMChunk) {
                const base64 = arrayBufferToBase64(audioData);
                await CallAudioModule.writePCMChunk(base64);
              }
            },
            onError: (err) => console.error("WS Error:", err),
            onDisconnected: () => console.log("WS Disconnected")
          });

          // 3. Start Native Recording (PCM)
          if (CallAudioModule?.startRecordingPCM) {
            await CallAudioModule.startRecordingPCM();
            setIsRecordingActive(true);
            setCallState("recording");
            console.log("🎤 Native PCM Recording Started");
          } else {
            console.warn("CallAudioModule.startRecordingPCM is missing!");
          }

          // Store cleanup for later (bit hacky in a functional component without a ref for the sub, 
          // but we'll handle it in the stop logic or use a ref)
          // Ideally use a Ref for the subscription

          // We will attach the subscription result to a ref to clean it up
          (startAIProcessing as any).audioSub = audioSub;

        } catch (error) {
          console.error("Error starting AI:", error);
          isProcessingRef.current = false;
          setCallState("idle");
        }
      }, []);

      // Helper to stop everything
      const stopEverything = async () => {
        console.log("Stopping AI...");
        isProcessingRef.current = false;

        // Stop Native Recording
        if (CallAudioModule?.stopRecordingPCM) {
          await CallAudioModule.stopRecordingPCM();
        }
        setIsRecordingActive(false);

        // Remove listener
        if ((startAIProcessing as any).audioSub) {
          (startAIProcessing as any).audioSub.remove();
          (startAIProcessing as any).audioSub = null;
        }

        // Stop playback
        if (CallAudioModule?.stopPCMStream) {
          await CallAudioModule.stopPCMStream();
        }

        websocketManager.disconnect();
        setCallState("idle");
      };

      // Helper to start AI with audio mode setup
      const startAIWithAudioMode = async () => {
        if (isProcessingRef.current) return;

        console.log("📱 Call Active - Setting up Audio Mode (Streaming)...");
        isProcessingRef.current = true;
        setCallState("active");

        try {
          // 1. Start Native PCM Stream (16kHz for Voice)
          if (CallAudioModule?.startPCMStream) {
            // Start streaming audio track which also sets mode to IN_COMMUNICATION
            await CallAudioModule.startPCMStream(16000);
            console.log("✅ PCM Stream started at 16000Hz");
          } else {
            console.warn("CallAudioModule.startPCMStream missing! Falling back to setCallAudioMode");
            if (CallAudioModule?.setCallAudioMode) {
              await CallAudioModule.setCallAudioMode();
            }
          }

          // 2. Wait a moment for audio path to stabilize
          await new Promise(resolve => setTimeout(resolve, 500));

          // 3. Start AI logic
          await startAIProcessing();

        } catch (err) {
          console.error("❌ Failed to setup audio mode:", err);
          // Try to continue anyway
          await startAIProcessing();
        }
      };

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

          // Start native listener
          if (TelephonyModule?.startListener) {
            TelephonyModule.startListener();
            console.log("✅ Native call listener started");
          }

          // Set up event emitter
          const eventEmitter = new NativeEventEmitter(TelephonyModule);
          const subscription = eventEmitter.addListener('onCallStateChanged', async (event) => {
            const { state, stateStr } = event;
            console.log(`📡 Event: Call State Changed to ${stateStr} (${state})`);

            // Sync raw state
            setRawTelephonyState(state);

            // Handle states
            if (state === 1) { // RINGING
              setCallState("incoming");
              console.log("📞 EVENT: Incoming call detected");

              if (!answeringRef.current) {
                answeringRef.current = true;
                console.log("⚡ Auto-answering (Triggered)...");

                if (TelephonyModule?.answerIncomingCall) {
                  // Small delay to let system settle
                  setTimeout(async () => {
                    try {
                      await TelephonyModule.answerIncomingCall();
                      console.log("✅ Auto-answer command sent");
                    } catch (err) {
                      console.error("Answer failed", err);
                      answeringRef.current = false; // reset on fail
                    }
                  }, 500);
                }
              } else {
                console.log("⚠️ Ignoring duplicate ringing event");
              }

            } else if (state === 2) { // OFFHOOK/ACTIVE
              answeringRef.current = false; // Reset answer lock

              if (!isProcessingRef.current) {
                await startAIWithAudioMode();
              }

            } else if (state === 0) { // IDLE
              answeringRef.current = false; // Reset answer lock

              if (isProcessingRef.current) {
                console.log("⚪ EVENT: Call ended");
                isProcessingRef.current = false;

                if (CallAudioModule?.stopPCMStream) {
                  await CallAudioModule.stopPCMStream();
                } else if (CallAudioModule?.resetAudioMode) {
                  await CallAudioModule.resetAudioMode();
                }

                await stopRecording();
                setCallState("idle");
              }
            }
          });

          // Polling as reliable watchdog (Read-Only)
          pollInterval = setInterval(async () => {
            if (!mounted) return;

            const telephonyState = await getTelephonyState();

            if (telephonyState === 2 && !isProcessingRef.current) {
              // If we missed the event, start AI
              console.log("⚠️ Polling detected Active Call (Missed event?)");
              await startAIWithAudioMode();

            } else if (telephonyState === 0 && isProcessingRef.current) {
              // Call ended but we missed event
              console.log("⚠️ Polling detected Call End");
              isProcessingRef.current = false;
              if (CallAudioModule?.stopPCMStream) {
                await CallAudioModule.stopPCMStream();
              }
              await stopRecording();
              setCallState("idle");
              setRecordingDuration(0);
            }
          }, 2000);

          return () => {
            subscription.remove();
            if (TelephonyModule?.stopListener) TelephonyModule.stopListener();
          };
        };

        init().catch(console.error);

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
              <Text style={styles.detailLabel}>AI Mode:</Text>
              <Text style={[styles.detailValue, { color: "#2196F3" }]}>
                WebSocket (PCM)
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
