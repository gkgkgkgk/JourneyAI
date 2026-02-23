import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, ActivityIndicator,
} from 'react-native';
import { Sun, Moon, Save, Cpu, BookOpen } from 'lucide-react-native';
import { Colors, Fonts } from '@/constants/theme';
import { updateSettings } from '@/api/client';
import { useJourney, useAppColorScheme } from "@/context/JourneyContext";

export default function SettingsView() {
    const colorScheme = useAppColorScheme();
    const theme = Colors[colorScheme ?? 'dark'];
    const { systemPrompt, setSystemPrompt, readingNotes, setReadingNotes, theme: appTheme, setTheme } = useJourney();

    const [localPrompt, setLocalPrompt] = useState(systemPrompt);
    const [localNotes, setLocalNotes] = useState(readingNotes);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateSettings({ system_prompt: localPrompt, reading_notes: localNotes, theme: appTheme });
            setSystemPrompt(localPrompt);
            setReadingNotes(localNotes);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            console.error('Failed to save settings', e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleThemeChange = async (t: 'dark' | 'light') => {
        setTheme(t);
        try {
            await updateSettings({ theme: t });
        } catch (e) {
            console.error('Failed to save theme', e);
        }
    };

    return (
        <ScrollView
            style={[styles.scroll, { backgroundColor: theme.background }]}
            contentContainerStyle={styles.content}
        >
            <Text style={[styles.pageTitle, { color: theme.text }]}>Settings</Text>

            {/* Theme */}
            <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Appearance</Text>
                    <Text style={[styles.sectionDesc, { color: theme.secondary }]}>
                        Choose how Journey looks.
                    </Text>
                </View>

                <View style={styles.themeRow}>
                    <TouchableOpacity
                        onPress={() => handleThemeChange('dark')}
                        style={[
                            styles.themeBtn,
                            {
                                borderColor: appTheme === 'dark' ? theme.primary : theme.border,
                                backgroundColor: appTheme === 'dark' ? theme.primary + '18' : 'transparent',
                            },
                        ]}
                    >
                        <Moon size={20} color={appTheme === 'dark' ? theme.primary : theme.secondary} />
                        <Text style={[styles.themeBtnText, { color: appTheme === 'dark' ? theme.primary : theme.secondary }]}>
                            Dark
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => handleThemeChange('light')}
                        style={[
                            styles.themeBtn,
                            {
                                borderColor: appTheme === 'light' ? theme.primary : theme.border,
                                backgroundColor: appTheme === 'light' ? theme.primary + '18' : 'transparent',
                            },
                        ]}
                    >
                        <Sun size={20} color={appTheme === 'light' ? theme.primary : theme.secondary} />
                        <Text style={[styles.themeBtnText, { color: appTheme === 'light' ? theme.primary : theme.secondary }]}>
                            Light
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Project Context */}
            <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.sectionHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Cpu size={18} color={theme.tint} />
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Project Context</Text>
                    </View>
                    <Text style={[styles.sectionDesc, { color: theme.secondary }]}>
                        Describe your manuscript — its subject, key people, time period, and anything else the AI should know. This is included in every AI session.
                    </Text>
                    <Text style={[styles.sectionHint, { color: theme.icon }]}>
                        e.g. "This is a memoir about my grandfather's journey from Poland to Israel between 1935–1952. The main characters are Moshe, Rivka, and their three children."
                    </Text>
                </View>

                <TextInput
                    style={[styles.promptInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
                    multiline
                    placeholder="Describe your manuscript, its subject, key people, time period…"
                    placeholderTextColor={theme.icon}
                    value={localPrompt}
                    onChangeText={setLocalPrompt}
                    textAlignVertical="top"
                />
            </View>

            {/* Archivist's Notes */}
            <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.sectionHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <BookOpen size={18} color={theme.primary} />
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Archivist's Notes</Text>
                    </View>
                    <Text style={[styles.sectionDesc, { color: theme.secondary }]}>
                        Tips and conventions to help the AI interpret your source material correctly. Think of it as a decoder ring for your archive.
                    </Text>
                    <Text style={[styles.sectionHint, { color: theme.icon }]}>
                        e.g. "Ruth is often referred to as 'R' in handwritten notes. Some sources are written on institutional letterhead — ignore the printed header and address."
                    </Text>
                </View>

                <TextInput
                    style={[styles.promptInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
                    multiline
                    placeholder="Aliases, shorthand, formatting quirks, things to ignore…"
                    placeholderTextColor={theme.icon}
                    value={localNotes}
                    onChangeText={setLocalNotes}
                    textAlignVertical="top"
                />
            </View>

            {/* Save */}
            <TouchableOpacity
                onPress={handleSave}
                disabled={isSaving}
                style={[styles.saveBtn, { backgroundColor: saved ? theme.success : theme.primary }]}
            >
                {isSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Save size={16} color="#fff" />
                }
                <Text style={styles.saveBtnText}>
                    {isSaving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
                </Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    content: {
        padding: 40,
        paddingBottom: 80,
        maxWidth: 720,
        width: '100%',
        alignSelf: 'center',
    },
    pageTitle: {
        fontSize: 28,
        fontWeight: '700',
        fontFamily: Fonts?.heading ?? 'serif',
        marginBottom: 32,
    },
    section: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 24,
        marginBottom: 24,
        gap: 16,
    },
    sectionHeader: { gap: 6 },
    sectionTitle: { fontSize: 16, fontWeight: '700' },
    sectionDesc: { fontSize: 13, lineHeight: 20 },
    sectionHint: { fontSize: 12, lineHeight: 18, fontStyle: 'italic' },

    themeRow: { flexDirection: 'row', gap: 12 },
    themeBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1.5,
    },
    themeBtnText: { fontSize: 14, fontWeight: '600' },

    promptInput: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 14,
        fontSize: 14,
        lineHeight: 22,
        minHeight: 140,
        fontFamily: Fonts?.body ?? 'sans-serif',
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 8,
        marginBottom: 8,
    },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
