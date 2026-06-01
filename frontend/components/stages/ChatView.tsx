import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { MessageSquare, Send, X } from 'lucide-react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useAppColorScheme } from '@/context/JourneyContext';
import { streamChat } from '@/api/client';

interface ChatSource {
    id: string;
    title: string;
    summary: string;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
    sources?: ChatSource[];
}

export default function ChatView({ onClose }: { onClose?: () => void }) {
    const colorScheme = useAppColorScheme();
    const theme = Colors[colorScheme ?? 'dark'];

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const [pendingSources, setPendingSources] = useState<ChatSource[]>([]);
    const scrollRef = useRef<ScrollView>(null);

    useEffect(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
    }, [messages, streamingContent]);

    const handleSend = async () => {
        const text = input.trim();
        if (!text || isStreaming) return;

        const userMsg: Message = { role: 'user', content: text };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setIsStreaming(true);
        setStreamingContent('');
        setPendingSources([]);

        const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

        let accSources: ChatSource[] = [];
        let accContent = '';

        try {
            for await (const event of streamChat(apiMessages)) {
                if (event.type === 'sources') {
                    accSources = event.sources;
                    setPendingSources(event.sources);
                } else if (event.type === 'source_added') {
                    accSources = [...accSources, event.source];
                    setPendingSources(prev => [...prev, event.source]);
                } else if (event.type === 'token') {
                    accContent += event.text;
                    setStreamingContent(accContent);
                } else if (event.type === 'done') {
                    setMessages(prev => [
                        ...prev,
                        { role: 'assistant', content: accContent, sources: accSources },
                    ]);
                    setStreamingContent('');
                    setPendingSources([]);
                    setIsStreaming(false);
                } else if (event.type === 'error') {
                    setMessages(prev => [
                        ...prev,
                        { role: 'assistant', content: `Error: ${event.message}`, sources: [] },
                    ]);
                    setIsStreaming(false);
                }
            }
        } catch {
            setIsStreaming(false);
        }
    };

    const handleKeyPress = (e: any) => {
        if (Platform.OS === 'web' && e.nativeEvent?.key === 'Enter' && !e.nativeEvent?.shiftKey) {
            e.preventDefault?.();
            handleSend();
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <MessageSquare size={18} color={theme.tint} />
                <Text style={[styles.headerTitle, { color: theme.text, fontFamily: Fonts?.heading }]}>
                    Ask Your Archive
                </Text>
                {onClose && (
                    <TouchableOpacity
                        onPress={onClose}
                        style={{ marginLeft: 'auto' }}
                        accessibilityLabel="Close chat panel"
                        accessibilityRole="button"
                    >
                        <X size={18} color={theme.icon} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Message list */}
            <ScrollView
                ref={scrollRef}
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
                keyboardShouldPersistTaps="handled"
            >
                {messages.length === 0 && !isStreaming && (
                    <View style={styles.emptyState}>
                        <MessageSquare size={32} color={theme.icon} style={{ marginBottom: 12 }} />
                        <Text style={[styles.emptyText, { color: theme.secondary, fontFamily: Fonts?.body }]}>
                            Ask anything about your archive. I'll search your indexed sources and answer with citations.
                        </Text>
                    </View>
                )}

                {messages.map((msg, index) => (
                    <MessageBubble key={index} message={msg} theme={theme} />
                ))}

                {/* Streaming in-progress bubble */}
                {isStreaming && (
                    <View style={styles.assistantRow}>
                        <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: theme.card }]}>
                            {streamingContent ? (
                                <Text style={[styles.bubbleText, { color: theme.text, fontFamily: Fonts?.body }]}>
                                    {streamingContent}
                                    <Text style={{ color: theme.tint }}>▊</Text>
                                </Text>
                            ) : (
                                <ActivityIndicator size="small" color={theme.tint} />
                            )}
                        </View>
                        {pendingSources.length > 0 && (
                            <SourceChips sources={pendingSources} theme={theme} />
                        )}
                    </View>
                )}
            </ScrollView>

            {/* Input area */}
            <View style={[styles.inputArea, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
                <TextInput
                    style={[
                        styles.textInput,
                        {
                            backgroundColor: theme.card,
                            borderColor: theme.border,
                            color: theme.text,
                            fontFamily: Fonts?.body,
                        },
                    ]}
                    value={input}
                    onChangeText={setInput}
                    placeholder="Ask anything about your archive..."
                    placeholderTextColor={theme.icon}
                    multiline
                    // @ts-ignore — web-only prop
                    onKeyPress={handleKeyPress}
                    editable={!isStreaming}
                    accessibilityLabel="Chat input"
                />
                <TouchableOpacity
                    onPress={handleSend}
                    disabled={isStreaming || !input.trim()}
                    style={[
                        styles.sendButton,
                        {
                            backgroundColor: theme.tint,
                            opacity: isStreaming || !input.trim() ? 0.4 : 1,
                        },
                    ]}
                    accessibilityLabel="Send message"
                    accessibilityRole="button"
                >
                    <Send size={16} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

// ---------- Sub-components ----------

interface MessageBubbleProps {
    message: Message;
    theme: (typeof Colors)['dark'];
}

function MessageBubble({ message, theme }: MessageBubbleProps) {
    const isUser = message.role === 'user';

    return (
        <View style={isUser ? styles.userRow : styles.assistantRow}>
            <View
                style={[
                    styles.bubble,
                    isUser
                        ? [styles.userBubble, { backgroundColor: theme.primary + '20' }]
                        : [styles.assistantBubble, { backgroundColor: theme.card }],
                ]}
            >
                <Text style={[styles.bubbleText, { color: theme.text, fontFamily: Fonts?.body }]}>
                    {message.content}
                </Text>
            </View>
            {!isUser && message.sources && message.sources.length > 0 && (
                <SourceChips sources={message.sources} theme={theme} />
            )}
        </View>
    );
}

interface SourceChipsProps {
    sources: ChatSource[];
    theme: (typeof Colors)['dark'];
}

function SourceChips({ sources, theme }: SourceChipsProps) {
    return (
        <View style={styles.chipsRow}>
            {sources.map(source => (
                <View
                    key={source.id}
                    style={[styles.chip, { backgroundColor: theme.tint + '15' }]}
                >
                    <Text style={[styles.chipText, { color: theme.tint, fontFamily: Fonts?.body }]} numberOfLines={1}>
                        {source.title}
                    </Text>
                </View>
            ))}
        </View>
    );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: 'column',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    messageList: {
        flex: 1,
    },
    messageListContent: {
        paddingVertical: 20,
        paddingHorizontal: 24,
        flexGrow: 1,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
        paddingHorizontal: 40,
    },
    emptyText: {
        fontSize: 14,
        lineHeight: 22,
        textAlign: 'center',
    },
    userRow: {
        alignItems: 'flex-end',
        marginBottom: 16,
    },
    assistantRow: {
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    bubble: {
        maxWidth: '75%',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    userBubble: {
        borderBottomRightRadius: 3,
    },
    assistantBubble: {
        borderBottomLeftRadius: 3,
    },
    bubbleText: {
        fontSize: 14,
        lineHeight: 22,
    },
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 6,
        maxWidth: '75%',
    },
    chip: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        maxWidth: 160,
    },
    chipText: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.2,
    },
    inputArea: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
        padding: 16,
        borderTopWidth: 1,
    },
    textInput: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 14,
        lineHeight: 20,
        maxHeight: 120,
        // @ts-ignore — web-only
        outlineStyle: 'none',
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 1,
    },
});
