/**
 * AI-EPABX with GSM-SIP Gateway Integration
 * Automatically answers calls and routes audio to AI endpoint via WebSocket
 */

import { useEffect, useRef, useState } from "react";
import {
    PermissionsAndroid,
    Platform,
    StyleSheet,
    Text,
    View,
    ScrollView,
} from "react-native";
import { telephonyManager, CallInfo } from "./utils/telephonyManager";
import { websocketManager } from "./utils/websocketManager";
import { audioBridge } from "./utils/audioBridge";
import { resetSession, getOrCreateSessionId } from "./utils/n8nProcessor";

type CallState = "idle" | "incoming" | "active" | "streaming" | "terminated";

interface ConversationItem {
    role: "user" | "assistant";
    text: string;
    timestamp: number;
}

export default function App() {
    const [callState, setCallState] = useState<CallState>("idle");
    const [permissionStatus, setPermissionStatus] = useState<string>("checking");
    const [isConnected, setIsConnected] = useState(false);
    const [conversation, setConversation] = useState<ConversationItem[]>([]);
    const [lastTranscription, setLastTranscription] = useState<string>("");
    const [currentCall, setCurrentCall] = useState<CallInfo | null>(null);
    const [callDuration, setCallDuration] = useState(0);

    const durationTimerRef = useRef<NodeJS.Timeout | null>(null);

    /**
     * Initialize all managers on app start
     */
    useEffect(() => {
        let mounted = true;

        const initializeApp = async () => {
            console.log("========== INITIALIZING APP ==========");

            // Request permissions
            const permissionsGranted = await requestPermissions();
            if (!permissionsGranted) {
                setPermissionStatus("denied");
                console.error("Permissions not granted");
                return;
            }
            setPermissionStatus("granted");

            // Initialize telephony manager
            const telephonyInit = await telephonyManager.initialize();
            if (!telephonyInit) {
                console.error("Failed to initialize telephony");
                return;
            }

            // Initialize audio bridge
            const audioBridgeInit = await audioBridge.initialize();
            if (!audioBridgeInit) {
                console.error("Failed to initialize audio bridge");
                return;
            }

            // Set up telephony callbacks
            telephonyManager.setCallbacks({
                onCallReceived: async (call) => {
                    console.log("📞 Call received from:", call.remoteNumber);
                    setCallState("incoming");
                    setCurrentCall(call);
                    setConversation([]);
                    setLastTranscription("");
                },

                onCallConnected: async (call) => {
                    console.log("📞 Call connected:", call.id);
                    if (!mounted) return;

                    setCallState("active");
                    setCurrentCall(call);

                    // Start call duration timer
                    setCallDuration(0);
                    durationTimerRef.current = setInterval(() => {
                        setCallDuration((prev) => prev + 1);
                    }, 1000);

                    // Create session and start audio streaming
                    const sessionId = getOrCreateSessionId();
                    resetSession();

                    // Connect WebSocket
                    const wsConnected = await websocketManager.connect(sessionId);
                    if (wsConnected) {
                        setIsConnected(true);

                        // Start audio bridging
                        const bridgeStarted = await audioBridge.startBridging(sessionId, call);
                        if (bridgeStarted) {
                            setCallState("streaming");
                            console.log("✅ Audio streaming started");
                        }
                    }
                },

                onCallTerminated: async (call) => {
                    console.log("📞 Call terminated:", call.id);
                    if (!mounted) return;

                    // Stop duration timer
                    if (durationTimerRef.current) {
                        clearInterval(durationTimerRef.current);
                        durationTimerRef.current = null;
                    }

                    // Stop audio bridge
                    await audioBridge.stopBridging();

                    // Disconnect WebSocket
                    websocketManager.disconnect();

                    setCallState("idle");
                    setCurrentCall(null);
                    setIsConnected(false);
                    setCallDuration(0);

                    console.log("✅ Call cleanup complete");
                },

                onCallStateChanged: (call) => {
                    console.log("📞 Call state changed:", call.state);
                    setCurrentCall(call);
                },
            });

            // Set up WebSocket callbacks
            websocketManager.setCallbacks({
                onConnected: () => {
                    console.log("🔌 WebSocket connected");
                    setIsConnected(true);
                },

                onDisconnected: () => {
                    console.log("🔌 WebSocket disconnected");
                    setIsConnected(false);
                },

                onTranscription: (text) => {
                    console.log("📝 Transcription:", text);
                    setLastTranscription(text);

                    // Add to conversation
                    setConversation((prev) => [
                        ...prev,
                        {
                            role: "user",
                            text: text,
                            timestamp: Date.now(),
                        },
                    ]);
                },

                onAudioResponse: async (audioData) => {
                    console.log("🔊 AI audio response received:", audioData.byteLength, "bytes");

                    // Inject audio into call
                    await audioBridge.injectAudio(audioData);

                    // Add to conversation
                    setConversation((prev) => [
                        ...prev,
                        {
                            role: "assistant",
                            text: "[Audio response]",
                            timestamp: Date.now(),
                        },
                    ]);
                },

                onError: (error) => {
                    console.error("❌ WebSocket error:", error);
                },
            });

            // Enable auto-answer
            telephonyManager.setAutoAnswer(true);

            console.log("✅ App initialized successfully");
            console.log("======================================");
        };

        initializeApp();

        // Cleanup on unmount
        return () => {
            mounted = false;
            if (durationTimerRef.current) {
                clearInterval(durationTimerRef.current);
            }
            telephonyManager.shutdown();
            audioBridge.stopBridging();
            websocketManager.disconnect();
        };
    }, []);

    /**
     * Request necessary permissions
     */
    const requestPermissions = async (): Promise<boolean> => {
        if (Platform.OS !== "android") {
            return true;
        }

        try {
            const grants = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
                PermissionsAndroid.PERMISSIONS.ANSWER_PHONE_CALLS,
                PermissionsAndroid.PERMISSIONS.CALL_PHONE,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            ]);

            const allGranted = Object.values(grants).every(
                (permission) => permission === PermissionsAndroid.RESULTS.GRANTED
            );

            if (!allGranted) {
                console.warn("Some permissions were denied:", grants);
                return false;
            }

            console.log("✅ All permissions granted");
            return true;
        } catch (err) {
            console.error("Permission request error:", err);
            return false;
        }
    };

    /**
     * Format call duration
     */
    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    /**
     * Get state configuration for UI
     */
    const getStateConfig = () => {
        switch (callState) {
            case "incoming":
                return {
                    color: "#FFA500",
                    icon: "📞",
                    text: "Incoming Call...",
                    bgColor: "#FFF3E0",
                };
            case "active":
                return {
                    color: "#4CAF50",
                    icon: "📱",
                    text: "Call Connected",
                    bgColor: "#E8F5E9",
                };
            case "streaming":
                return {
                    color: "#2196F3",
                    icon: "🎙️",
                    text: "AI Active",
                    bgColor: "#E3F2FD",
                };
            case "terminated":
                return {
                    color: "#9E9E9E",
                    icon: "📵",
                    text: "Call Ended",
                    bgColor: "#F5F5F5",
                };
            default:
                return {
                    color: "#9E9E9E",
                    icon: "⏸️",
                    text: "Waiting for call...",
                    bgColor: "#FAFAFA",
                };
        }
    };

    const stateConfig = getStateConfig();

    return (
        <View style={[styles.container, { backgroundColor: stateConfig.bgColor }]}>
            <Text style={styles.title}>AI-EPABX{" "}
                <Text style={styles.subtitle}>GSM Gateway</Text>
            </Text>

            {/* Status Card */}
            <View style={[styles.statusCard, { borderColor: stateConfig.color }]}>
                <Text style={styles.statusIcon}>{stateConfig.icon}</Text>
                <Text style={[styles.statusText, { color: stateConfig.color }]}>
                    {stateConfig.text}
                </Text>

                {currentCall && (
                    <View style={styles.callInfo}>
                        <Text style={styles.callNumber}>{currentCall.remoteNumber}</Text>
                        {callState !== "idle" && (
                            <Text style={[styles.callDuration, { color: stateConfig.color }]}>
                                {formatDuration(callDuration)}
                            </Text>
                        )}
                    </View>
                )}

                {/* Connection Status */}
                <View style={styles.connectionStatus}>
                    <View style={[styles.statusDot, {
                        backgroundColor: isConnected ? "#4CAF50" : "#F44336"
                    }]} />
                    <Text style={styles.connectionText}>
                        {isConnected ? "WebSocket Connected" : "WebSocket Disconnected"}
                    </Text>
                </View>
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
                                    item.role === "assistant" ? styles.assistantRow : styles.userRow,
                                ]}
                            >
                                <Text style={styles.messageRole}>
                                    {item.role === "user" ? "Caller:" : "AI:"}
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

            {/* System Status */}
            <View style={styles.detailsCard}>
                <Text style={styles.detailsTitle}>System Status</Text>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Permissions:</Text>
                    <Text
                        style={[
                            styles.detailValue,
                            { color: permissionStatus === "granted" ? "#4CAF50" : "#F44336" },
                        ]}
                    >
                        {permissionStatus === "granted" ? "Granted" : "Denied"}
                    </Text>
                </View>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Telephony:</Text>
                    <Text
                        style={[
                            styles.detailValue,
                            { color: telephonyManager.isReady() ? "#4CAF50" : "#F44336" },
                        ]}
                    >
                        {telephonyManager.isReady() ? "Ready" : "Not Ready"}
                    </Text>
                </View>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Audio Bridge:</Text>
                    <Text
                        style={[
                            styles.detailValue,
                            { color: audioBridge.isBridgeActive() ? "#4CAF50" : "#9E9E9E" },
                        ]}
                    >
                        {audioBridge.isBridgeActive() ? "Active" : "Inactive"}
                    </Text>
                </View>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Auto-Answer:</Text>
                    <Text style={[styles.detailValue, { color: "#4CAF50" }]}>Enabled</Text>
                </View>
            </View>

            <Text style={styles.hint}>
                {permissionStatus === "granted"
                    ? "Incoming calls will be automatically answered"
                    : "Please grant all permissions to enable auto-answer"}
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
        marginBottom: 4,
        color: "#333",
    },
    subtitle: {
        fontSize: 14,
        fontWeight: "normal",
        color: "#666",
    },
    statusCard: {
        backgroundColor: "#FFF",
        borderRadius: 16,
        padding: 20,
        alignItems: "center",
        borderWidth: 2,
        marginBottom: 12,
        marginTop: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    statusIcon: {
        fontSize: 48,
        marginBottom: 8,
    },
    statusText: {
        fontSize: 18,
        fontWeight: "600",
        marginBottom: 8,
    },
    callInfo: {
        alignItems: "center",
        marginTop: 8,
    },
    callNumber: {
        fontSize: 16,
        fontWeight: "500",
        color: "#333",
        marginBottom: 4,
    },
    callDuration: {
        fontSize: 24,
        fontWeight: "bold",
        fontVariant: ["tabular-nums"],
    },
    connectionStatus: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: "#E0E0E0",
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    connectionText: {
        fontSize: 12,
        color: "#666",
    },
    conversationCard: {
        backgroundColor: "#FFF",
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        maxHeight: 180,
    },
    conversationTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#333",
        marginBottom: 8,
    },
    conversationScroll: {
        maxHeight: 140,
    },
    messageRow: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        marginBottom: 6,
    },
    userRow: {
        backgroundColor: "#E3F2FD",
    },
    assistantRow: {
        backgroundColor: "#F3E5F5",
    },
    messageRole: {
        fontSize: 11,
        fontWeight: "bold",
        color: "#666",
        marginBottom: 2,
    },
    messageText: {
        fontSize: 13,
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
