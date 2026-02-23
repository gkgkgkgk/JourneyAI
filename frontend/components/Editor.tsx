import React, { useState } from 'react';
import { View, TextInput, StyleSheet, ScrollView,  Platform } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useAppColorScheme } from '@/context/JourneyContext';
import RichEditor from '@/components/RichEditor';

export default function Editor() {
    const colorScheme = useAppColorScheme();
    const theme = Colors[colorScheme ?? 'dark'];
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');

    return (
        <ScrollView
            style={[styles.scroll, { backgroundColor: theme.background }]}
            contentContainerStyle={styles.scrollContent}
        >
            <View style={[
                styles.page,
                {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    // Web shadow
                    ...(Platform.OS === 'web' ? {
                        boxShadow: `0 2px 16px ${colorScheme === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)'}`,
                    } : {
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: colorScheme === 'dark' ? 0.4 : 0.08,
                        shadowRadius: 12,
                        elevation: 4,
                    }),
                },
            ]}>
                <TextInput
                    style={[styles.titleInput, { color: theme.text, borderBottomColor: theme.border }]}
                    placeholder="Chapter Title"
                    placeholderTextColor={theme.secondary}
                    value={title}
                    onChangeText={setTitle}
                />
                <View style={{ minHeight: 500 }}>
                    <RichEditor
                        value={content}
                        onChange={setContent}
                        placeholder="Start writing…"
                    />
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scroll: {
        flex: 1,
    },
    scrollContent: {
        padding: 40,
        paddingBottom: 80,
        alignItems: 'center',
    },
    page: {
        width: '100%',
        maxWidth: 780,
        borderRadius: 8,
        borderWidth: 1,
        overflow: 'hidden',
    },
    titleInput: {
        fontSize: 30,
        fontWeight: 'bold',
        fontFamily: Fonts?.heading ?? 'serif',
        paddingHorizontal: 28,
        paddingTop: 32,
        paddingBottom: 16,
        borderBottomWidth: 1,
    },
});
