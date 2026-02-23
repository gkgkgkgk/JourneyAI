import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, ActivityIndicator, Platform, Modal,
} from 'react-native';
import { Plus, Trash2, Save, ChevronUp, ChevronDown, BookOpen } from 'lucide-react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useAppColorScheme } from '@/context/JourneyContext';
import RichEditor from '@/components/RichEditor';
import { getChapters, createChapter, updateChapter, deleteChapter, reorderChapter } from '@/api/client';

interface Chapter {
    id: string;
    title: string | null;
    content: string;
    order_index: number;
    created_at: string;
    updated_at: string;
}

function wc(text: string) {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export default function ManuscriptView() {
    const colorScheme = useAppColorScheme();
    const theme = Colors[colorScheme ?? 'dark'];

    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [selected, setSelected] = useState<Chapter | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editContent, setEditContent] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [savedLabel, setSavedLabel] = useState('Saved');

    useEffect(() => { loadChapters(); }, []);

    // Auto-save: 2s after the user stops typing
    useEffect(() => {
        if (!isDirty || !selected) return;
        const timer = setTimeout(async () => {
            setIsSaving(true);
            try {
                const updated = await updateChapter(selected.id, {
                    title: editTitle || undefined,
                    content: editContent,
                });
                setChapters(prev => prev.map(c => c.id === updated.id ? updated : c));
                setSelected(updated);
                setIsDirty(false);
                setLastSavedAt(new Date());
            } catch (e) {
                console.error('Auto-save failed', e);
            } finally {
                setIsSaving(false);
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [isDirty, editContent, editTitle]);

    // "Saved Xs ago" ticker
    useEffect(() => {
        if (!lastSavedAt) return;
        setSavedLabel('Saved just now');
        const interval = setInterval(() => {
            const secs = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
            if (secs < 10) setSavedLabel('Saved just now');
            else if (secs < 60) setSavedLabel(`Saved ${secs}s ago`);
            else setSavedLabel(`Saved ${Math.floor(secs / 60)}m ago`);
        }, 1000);
        return () => clearInterval(interval);
    }, [lastSavedAt]);

    const loadChapters = async () => {
        try {
            const data = await getChapters();
            setChapters(data);
        } catch (e) {
            console.error('Failed to load chapters', e);
        }
    };

    const selectChapter = (ch: Chapter) => {
        setSelected(ch);
        setEditTitle(ch.title ?? '');
        setEditContent(ch.content ?? '');
        setIsDirty(false);
        setLastSavedAt(null);
        setSavedLabel('Saved');
    };

    const handleNew = async () => {
        try {
            const ch = await createChapter({ title: '', content: '' });
            setChapters(prev => [...prev, ch]);
            selectChapter(ch);
        } catch (e) {
            console.error('Failed to create chapter', e);
        }
    };

    const handleSave = async () => {
        if (!selected) return;
        setIsSaving(true);
        try {
            const updated = await updateChapter(selected.id, {
                title: editTitle || undefined,
                content: editContent,
            });
            setChapters(prev => prev.map(c => c.id === updated.id ? updated : c));
            setSelected(updated);
            setIsDirty(false);
            setLastSavedAt(new Date());
        } catch (e) {
            console.error('Save failed', e);
        } finally {
            setIsSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!selected) return;
        setDeleteModalVisible(false);
        try {
            await deleteChapter(selected.id);
            const remaining = chapters
                .filter(c => c.id !== selected.id)
                .map((c, i) => ({ ...c, order_index: i }));
            setChapters(remaining);
            selectChapter(remaining.length > 0 ? remaining[remaining.length - 1] : null as any);
            if (remaining.length === 0) setSelected(null);
        } catch (e) {
            console.error('Delete failed', e);
        }
    };

    const handleMove = async (ch: Chapter, dir: 'up' | 'down') => {
        const newIdx = dir === 'up' ? ch.order_index - 1 : ch.order_index + 1;
        if (newIdx < 0 || newIdx >= chapters.length) return;
        try {
            const updated = await reorderChapter(ch.id, newIdx);
            setChapters(updated);
        } catch (e) {
            console.error('Reorder failed', e);
        }
    };

    const totalWords = chapters.reduce((sum, c) => sum + wc(c.content), 0);

    return (
        <>
            <View style={[styles.root, { backgroundColor: theme.background }]}>

                {/* ── Chapter List Sidebar ── */}
                <View style={[styles.sidebar, { backgroundColor: theme.card, borderRightColor: theme.border }]}>
                    <View style={[styles.sidebarHeader, { borderBottomColor: theme.border }]}>
                        <Text style={[styles.sidebarTitle, { color: theme.text }]}>Chapters</Text>
                        <Text style={[styles.wordTally, { color: theme.secondary }]}>
                            {totalWords.toLocaleString()} words
                        </Text>
                    </View>

                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                        {chapters.length === 0 && (
                            <Text style={[styles.emptyHint, { color: theme.secondary }]}>
                                No chapters yet. Start with your first one.
                            </Text>
                        )}
                        {chapters.map((ch, i) => {
                            const active = selected?.id === ch.id;
                            return (
                                <View key={ch.id} style={[
                                    styles.chapterRow,
                                    {
                                        backgroundColor: active ? theme.primary + '18' : 'transparent',
                                        borderLeftColor: active ? theme.primary : 'transparent',
                                    },
                                ]}>
                                    <TouchableOpacity style={styles.chapterRowContent} onPress={() => selectChapter(ch)}>
                                        <Text style={[styles.chapterNum, { color: theme.secondary }]}>
                                            {String(i + 1).padStart(2, '0')}
                                        </Text>
                                        <View style={{ flex: 1 }}>
                                            <Text numberOfLines={1} style={[styles.chapterTitle, { color: theme.text }]}>
                                                {ch.title || 'Untitled'}
                                            </Text>
                                            <Text style={[styles.chapterWords, { color: theme.icon }]}>
                                                {wc(ch.content).toLocaleString()} words
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                    <View style={styles.reorderBtns}>
                                        <TouchableOpacity
                                            onPress={() => handleMove(ch, 'up')}
                                            disabled={i === 0}
                                            style={{ opacity: i === 0 ? 0.25 : 1 }}
                                        >
                                            <ChevronUp size={14} color={theme.secondary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => handleMove(ch, 'down')}
                                            disabled={i === chapters.length - 1}
                                            style={{ opacity: i === chapters.length - 1 ? 0.25 : 1 }}
                                        >
                                            <ChevronDown size={14} color={theme.secondary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        })}
                    </ScrollView>

                    <TouchableOpacity
                        onPress={handleNew}
                        style={[styles.newBtn, { backgroundColor: theme.primary }]}
                    >
                        <Plus size={16} color="#fff" />
                        <Text style={styles.newBtnText}>New Chapter</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Editor ── */}
                {selected ? (
                    <ScrollView
                        style={[styles.editorScroll, { backgroundColor: theme.background }]}
                        contentContainerStyle={styles.editorScrollContent}
                    >
                        <View style={[
                            styles.page,
                            {
                                backgroundColor: theme.card,
                                borderColor: theme.border,
                                ...(Platform.OS === 'web' ? {
                                    // @ts-ignore
                                    boxShadow: colorScheme === 'dark'
                                        ? '0 2px 16px rgba(0,0,0,0.4)'
                                        : '0 2px 16px rgba(0,0,0,0.08)',
                                } : {
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.1,
                                    shadowRadius: 12,
                                    elevation: 4,
                                }),
                            },
                        ]}>
                            <TextInput
                                style={[styles.titleInput, { color: theme.text, borderBottomColor: theme.border }]}
                                placeholder="Chapter Title"
                                placeholderTextColor={theme.secondary}
                                value={editTitle}
                                onChangeText={v => { setEditTitle(v); setIsDirty(true); }}
                            />

                            <View style={{ minHeight: 500 }}>
                                <RichEditor
                                    value={editContent}
                                    onChange={v => { setEditContent(v); setIsDirty(true); }}
                                    placeholder="Start writing this chapter…"
                                />
                            </View>

                            <View style={[styles.bottomBar, { borderTopColor: theme.border }]}>
                                <Text style={[styles.wordCountText, { color: theme.icon }]}>
                                    {wc(editContent).toLocaleString()} words
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <TouchableOpacity
                                        onPress={() => setDeleteModalVisible(true)}
                                        style={[styles.actionBtn, { backgroundColor: theme.error + '15' }]}
                                    >
                                        <Trash2 size={14} color={theme.error} />
                                        <Text style={[styles.actionBtnText, { color: theme.error }]}>Delete</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={handleSave}
                                        disabled={isSaving || !isDirty}
                                        style={[styles.actionBtn, {
                                            backgroundColor: theme.success + '20',
                                            opacity: !isDirty && !isSaving ? 0.4 : 1,
                                        }]}
                                    >
                                        {isSaving
                                            ? <ActivityIndicator size="small" color={theme.success} />
                                            : <Save size={14} color={theme.success} />
                                        }
                                        <Text style={[styles.actionBtnText, { color: theme.success }]}>
                                            {isSaving ? 'Saving…' : isDirty ? 'Save' : savedLabel}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </ScrollView>
                ) : (
                    <View style={styles.emptyEditor}>
                        <BookOpen size={52} color={theme.border} />
                        <Text style={[styles.emptyEditorTitle, { color: theme.secondary }]}>No chapter selected</Text>
                        <Text style={[styles.emptyEditorHint, { color: theme.icon }]}>
                            Create your first chapter from the sidebar.
                        </Text>
                    </View>
                )}
            </View>

            <Modal transparent visible={deleteModalVisible} animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.modalTitle, { color: theme.text }]}>Delete Chapter?</Text>
                        <Text style={[styles.modalBody, { color: theme.secondary }]}>
                            "{selected?.title || 'Untitled'}" will be permanently deleted.
                        </Text>
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                onPress={() => setDeleteModalVisible(false)}
                                style={[styles.modalBtn, { backgroundColor: theme.border }]}
                            >
                                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={confirmDelete}
                                style={[styles.modalBtn, { backgroundColor: theme.error }]}
                            >
                                <Text style={{ color: '#fff', fontWeight: '700' }}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, flexDirection: 'row' },

    sidebar: { width: 240, borderRightWidth: 1, flexDirection: 'column' },
    sidebarHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
    },
    sidebarTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    wordTally: { fontSize: 11 },
    emptyHint: { fontSize: 12, textAlign: 'center', padding: 24, lineHeight: 18 },

    chapterRow: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 3, paddingRight: 8 },
    chapterRowContent: {
        flex: 1, flexDirection: 'row', alignItems: 'center',
        paddingVertical: 12, paddingHorizontal: 12, gap: 10,
    },
    chapterNum: { fontSize: 11, fontWeight: '700', fontFamily: Fonts?.body ?? 'sans-serif', width: 20 },
    chapterTitle: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
    chapterWords: { fontSize: 11 },
    reorderBtns: { flexDirection: 'column', gap: 2, paddingRight: 4 },

    newBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, margin: 12, paddingVertical: 10, borderRadius: 8,
    },
    newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    editorScroll: { flex: 1 },
    editorScrollContent: { padding: 40, paddingBottom: 80, alignItems: 'center' },
    page: { width: '100%', maxWidth: 780, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
    titleInput: {
        fontSize: 28, fontWeight: '700', fontFamily: Fonts?.heading ?? 'serif',
        paddingHorizontal: 28, paddingTop: 32, paddingBottom: 16, borderBottomWidth: 1,
    },
    bottomBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 24, paddingVertical: 12, borderTopWidth: 1,
    },
    wordCountText: { fontSize: 12 },
    actionBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 7,
    },
    actionBtnText: { fontSize: 13, fontWeight: '600' },

    emptyEditor: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    emptyEditorTitle: { fontSize: 16, fontWeight: '600' },
    emptyEditorHint: { fontSize: 13 },
    modalOverlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: 360, padding: 24, borderRadius: 16, borderWidth: 1 },
    modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
    modalBody: { fontSize: 14, lineHeight: 22, marginBottom: 24 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
    modalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
});
