import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, ActivityIndicator, Modal, Platform,
} from 'react-native';
import RichEditor from '@/components/RichEditor';
import {
    Plus, Trash2, Sparkles, Save, BookOpen, Film, StickyNote,
    CheckCircle, AlertTriangle, Lightbulb, Clock, Library, Quote, X,
} from 'lucide-react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useAppColorScheme } from '@/context/JourneyContext';
import { getNotes, createNote, updateNote, deleteNote, getNoteFeedback, kickstartNote, searchSources, analyzeCitation, SourceSearchResult, CitationAnalysis } from '@/api/client';

type NoteType = 'chapter' | 'scene' | 'note';

interface MatchedSource {
    id: string;
    title: string | null;
    summary: string | null;
    tidbits: string[];
}

interface AiFeedback {
    accurate: string[];
    concerns: string[];
    suggestions: string[];
    tone: string;
}

interface Note {
    id: string;
    title: string | null;
    content: string;
    note_type: NoteType;
    created_at: string;
    updated_at: string;
    ai_feedback: AiFeedback | null;
    source_ids: string[] | null;
    feedback_at: string | null;
    matched_sources?: MatchedSource[];
    recommended_sources?: MatchedSource[];
}

const NOTE_TYPES: { value: NoteType; label: string; Icon: React.FC<any> }[] = [
    { value: 'chapter', label: 'Chapter', Icon: BookOpen },
    { value: 'scene', label: 'Scene', Icon: Film },
    { value: 'note', label: 'Note', Icon: StickyNote },
];

function typeColor(type: NoteType, theme: typeof Colors.dark) {
    if (type === 'chapter') return theme.primary;
    if (type === 'scene') return theme.tint;
    return theme.secondary;
}

function formatRelative(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

export default function ForgeView() {
    const colorScheme = useAppColorScheme();
    const theme = Colors[colorScheme ?? 'dark'];

    const [notes, setNotes] = useState<Note[]>([]);
    const [selectedNote, setSelectedNote] = useState<Note | null>(null);

    const [editTitle, setEditTitle] = useState('');
    const [editContent, setEditContent] = useState('');
    const [editType, setEditType] = useState<NoteType>('note');
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [newNoteModal, setNewNoteModal] = useState(false);
    const [kickstartMode, setKickstartMode] = useState(false);
    const [ksPrompt, setKsPrompt] = useState('');
    const [ksType, setKsType] = useState<NoteType>('note');
    const [ksLength, setKsLength] = useState<'short' | 'medium' | 'long'>('medium');
    const [ksFormat, setKsFormat] = useState<'prose' | 'outline' | 'rough'>('prose');
    const [isKickstarting, setIsKickstarting] = useState(false);
    const [isFetchingFeedback, setIsFetchingFeedback] = useState(false);
    const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [savedLabel, setSavedLabel] = useState('Saved');

    // Inline citation
    const [selectionText, setSelectionText] = useState('');
    const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
    const [citeResults, setCiteResults] = useState<SourceSearchResult[] | null>(null);
    const [isCiting, setIsCiting] = useState(false);
    const [citeExpandedId, setCiteExpandedId] = useState<string | null>(null);

    // Citation analysis
    const [citeAnalysis, setCiteAnalysis] = useState<CitationAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [copiedKey, setCopiedKey] = useState<'completion' | 'next' | null>(null);

    useEffect(() => { loadNotes(); }, []);

    // Auto-save: 2s after the user stops typing
    useEffect(() => {
        if (!isDirty || !selectedNote) return;
        const timer = setTimeout(async () => {
            setIsSaving(true);
            try {
                const updated = await updateNote(selectedNote.id, {
                    title: editTitle || undefined,
                    content: editContent,
                    note_type: editType,
                });
                setNotes(prev => prev.map(n => n.id === updated.id ? { ...n, ...updated } : n));
                setSelectedNote(prev => prev ? { ...prev, ...updated } : prev);
                setIsDirty(false);
                setLastSavedAt(new Date());
            } catch (e) {
                console.error('Auto-save failed', e);
            } finally {
                setIsSaving(false);
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [isDirty, editContent, editTitle, editType]);

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

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const handleSelectionChange = () => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.toString().trim()) {
                setSelectionText('');
                setTooltipPos(null);
                return;
            }
            const range = sel.getRangeAt(0);
            const editorEl = document.querySelector('.ProseMirror');
            if (!editorEl || !editorEl.contains(range.commonAncestorContainer)) {
                setSelectionText('');
                setTooltipPos(null);
                return;
            }
            const rect = range.getBoundingClientRect();
            setSelectionText(sel.toString().trim());
            setTooltipPos({ top: rect.top - 44, left: rect.left + rect.width / 2 });
        };
        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, []);

    const handleCite = async () => {
        if (!selectionText) return;
        setIsCiting(true);
        setCiteResults(null);
        setCiteExpandedId(null);
        setCiteAnalysis(null);
        try {
            const results = await searchSources(selectionText, 4);
            setCiteResults(results);
        } catch (e) {
            console.error('Citation search failed', e);
        } finally {
            setIsCiting(false);
        }
    };

    const handleAnalyzeCitation = async () => {
        if (!citeResults || citeResults.length === 0) return;
        setIsAnalyzing(true);
        try {
            const analysis = await analyzeCitation(selectionText, citeResults.map(r => r.id));
            setCiteAnalysis(analysis);
        } catch (e) {
            console.error('Citation analysis failed', e);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleCopy = async (text: string, key: 'completion' | 'next') => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 2000);
        } catch (e) {
            console.error('Clipboard write failed', e);
        }
    };

    const loadNotes = async () => {
        try {
            const data = await getNotes();
            setNotes(data);
        } catch (e) {
            console.error('Failed to load notes', e);
        }
    };

    const selectNote = (note: Note) => {
        setSelectedNote(note);
        setEditTitle(note.title ?? '');
        setEditContent(note.content);
        setEditType(note.note_type);
        setIsDirty(false);
        setExpandedSourceId(null);
        setLastSavedAt(null);
        setSavedLabel('Saved');
    };

    const openNewNoteModal = () => {
        setKickstartMode(false);
        setKsPrompt('');
        setKsType('note');
        setKsLength('medium');
        setKsFormat('prose');
        setNewNoteModal(true);
    };

    const handleBlankNote = async () => {
        setNewNoteModal(false);
        try {
            const note = await createNote({ note_type: 'note', content: '', title: '' });
            setNotes(prev => [note, ...prev]);
            selectNote(note);
        } catch (e) {
            console.error('Failed to create note', e);
        }
    };

    const handleKickstart = async () => {
        if (!ksPrompt.trim()) return;
        setIsKickstarting(true);
        try {
            const note = await kickstartNote({ prompt: ksPrompt, note_type: ksType, length: ksLength, format: ksFormat });
            setNotes(prev => [note, ...prev]);
            selectNote(note);
            setNewNoteModal(false);
        } catch (e) {
            console.error('Kickstart failed', e);
        } finally {
            setIsKickstarting(false);
        }
    };

    const handleSave = async () => {
        if (!selectedNote) return;
        setIsSaving(true);
        try {
            const updated = await updateNote(selectedNote.id, {
                title: editTitle || undefined,
                content: editContent,
                note_type: editType,
            });
            setNotes(prev => prev.map(n => n.id === updated.id ? { ...n, ...updated } : n));
            setSelectedNote(prev => prev ? { ...prev, ...updated } : prev);
            setIsDirty(false);
            setLastSavedAt(new Date());
        } catch (e) {
            console.error('Save failed', e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleFeedback = async () => {
        if (!selectedNote) return;
        if (isDirty) await handleSave();
        setIsFetchingFeedback(true);
        try {
            const updated = await getNoteFeedback(selectedNote.id);
            setNotes(prev => prev.map(n => n.id === updated.id ? { ...n, ...updated } : n));
            setSelectedNote(updated);
        } catch (e) {
            console.error('Feedback failed', e);
        } finally {
            setIsFetchingFeedback(false);
        }
    };

    const confirmDelete = async () => {
        if (!selectedNote) return;
        setDeleteModalVisible(false);
        try {
            await deleteNote(selectedNote.id);
            setNotes(prev => prev.filter(n => n.id !== selectedNote.id));
            setSelectedNote(null);
        } catch (e) {
            console.error('Delete failed', e);
        }
    };

    const wordCount = editContent.trim() ? editContent.trim().split(/\s+/).length : 0;

    return (
        <View style={[styles.root, { backgroundColor: theme.background }]}>

            {/* ── Left: Note List ── */}
            <View style={[styles.sidebar, { backgroundColor: theme.card, borderRightColor: theme.border }]}>
                <TouchableOpacity
                    style={[styles.newBtn, { backgroundColor: theme.primary }]}
                    onPress={openNewNoteModal}
                >
                    <Plus size={16} color="#fff" />
                    <Text style={styles.newBtnText}>New Note</Text>
                </TouchableOpacity>

                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    {notes.length === 0 && (
                        <Text style={[styles.emptyHint, { color: theme.secondary }]}>
                            No notes yet. Hit "New Note" to start writing.
                        </Text>
                    )}
                    {notes.map(note => {
                        const active = selectedNote?.id === note.id;
                        const color = typeColor(note.note_type, theme);
                        return (
                            <TouchableOpacity
                                key={note.id}
                                onPress={() => selectNote(note)}
                                style={[
                                    styles.noteCard,
                                    {
                                        backgroundColor: active ? theme.primary + '18' : 'transparent',
                                        borderLeftColor: active ? theme.primary : 'transparent',
                                    },
                                ]}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                    <View style={[styles.typeBadge, { backgroundColor: color + '20' }]}>
                                        <Text style={[styles.typeBadgeText, { color }]}>
                                            {note.note_type}
                                        </Text>
                                    </View>
                                    {note.ai_feedback && (
                                        note.ai_feedback.concerns?.length > 0
                                            ? <AlertTriangle size={11} color={theme.warning} />
                                            : <CheckCircle size={11} color={theme.success} />
                                    )}
                                </View>
                                <Text numberOfLines={1} style={[styles.noteCardTitle, { color: theme.text }]}>
                                    {note.title || 'Untitled'}
                                </Text>
                                <Text numberOfLines={2} style={[styles.noteCardPreview, { color: theme.secondary }]}>
                                    {note.content || '—'}
                                </Text>
                                <Text style={[styles.noteCardDate, { color: theme.icon }]}>
                                    {formatRelative(note.updated_at)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* ── Center: Editor ── */}
            {selectedNote ? (
                <View style={[styles.editor, { borderRightColor: theme.border }]}>
                    {/* Type selector */}
                    <View style={[styles.editorTopBar, { borderBottomColor: theme.border }]}>
                        <View style={styles.typePills}>
                            {NOTE_TYPES.map(({ value, label, Icon }) => {
                                const active = editType === value;
                                const color = typeColor(value, theme);
                                return (
                                    <TouchableOpacity
                                        key={value}
                                        onPress={() => { setEditType(value); setIsDirty(true); }}
                                        style={[
                                            styles.typePill,
                                            {
                                                backgroundColor: active ? color + '20' : 'transparent',
                                                borderColor: active ? color : theme.border,
                                            },
                                        ]}
                                    >
                                        <Icon size={12} color={active ? color : theme.secondary} />
                                        <Text style={[styles.typePillText, { color: active ? color : theme.secondary }]}>
                                            {label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <TouchableOpacity onPress={() => setDeleteModalVisible(true)} style={styles.deleteBtn}>
                            <Trash2 size={16} color={theme.error} />
                        </TouchableOpacity>
                    </View>

                    {/* Title */}
                    <TextInput
                        style={[styles.titleInput, { color: theme.text, borderBottomColor: theme.border }]}
                        placeholder="Untitled"
                        placeholderTextColor={theme.secondary}
                        value={editTitle}
                        onChangeText={v => { setEditTitle(v); setIsDirty(true); }}
                    />

                    {/* Content */}
                    <View style={{ flex: 1, minHeight: 0 }}>
                        <RichEditor
                            value={editContent}
                            onChange={v => { setEditContent(v); setIsDirty(true); }}
                            placeholder="Start writing…"
                        />
                    </View>

                    {/* Bottom bar */}
                    <View style={[styles.editorBottomBar, { borderTopColor: theme.border }]}>
                        <Text style={[styles.wordCount, { color: theme.icon }]}>
                            {wordCount} {wordCount === 1 ? 'word' : 'words'}
                        </Text>
                        <View style={styles.editorActions}>
                            <TouchableOpacity
                                onPress={handleSave}
                                disabled={isSaving || !isDirty}
                                style={[
                                    styles.actionBtn,
                                    { backgroundColor: theme.success + '20', opacity: (!isDirty && !isSaving) ? 0.4 : 1 },
                                ]}
                            >
                                {isSaving
                                    ? <ActivityIndicator size="small" color={theme.success} />
                                    : <Save size={14} color={theme.success} />
                                }
                                <Text style={[styles.actionBtnText, { color: theme.success }]}>
                                    {isSaving ? 'Saving…' : isDirty ? 'Save' : savedLabel}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleFeedback}
                                disabled={isFetchingFeedback || !editContent.trim()}
                                style={[
                                    styles.actionBtn,
                                    { backgroundColor: theme.tint + '20', opacity: !editContent.trim() ? 0.4 : 1 },
                                ]}
                            >
                                {isFetchingFeedback
                                    ? <ActivityIndicator size="small" color={theme.tint} />
                                    : <Sparkles size={14} color={theme.tint} />
                                }
                                <Text style={[styles.actionBtnText, { color: theme.tint }]}>
                                    {isFetchingFeedback ? 'Reviewing…' : 'Get Feedback'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            ) : (
                <View style={[styles.editor, styles.editorEmpty]}>
                    <BookOpen size={48} color={theme.border} />
                    <Text style={[styles.editorEmptyText, { color: theme.secondary }]}>
                        Select a note or create a new one to start writing.
                    </Text>
                </View>
            )}

            {/* ── Right: AI Feedback Panel ── */}
            <View style={[styles.feedbackPanel, { backgroundColor: theme.card, borderLeftColor: theme.border }]}>
                <Text style={[styles.feedbackHeader, { color: theme.text, borderBottomColor: theme.border }]}>
                    {citeResults !== null ? 'Citation Search' : 'AI Feedback'}
                </Text>

                {/* Citation results panel */}
                {citeResults !== null && (
                    <View style={{ flex: 1 }}>
                        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <Text style={{ fontSize: 11, color: theme.secondary, fontStyle: 'italic', flex: 1 }} numberOfLines={2}>
                                    "{selectionText}"
                                </Text>
                                <TouchableOpacity onPress={() => { setCiteResults(null); setCiteAnalysis(null); }} style={{ marginLeft: 8 }}>
                                    <X size={14} color={theme.secondary} />
                                </TouchableOpacity>
                            </View>
                            {citeResults.length === 0 ? (
                                <Text style={{ color: theme.secondary, fontSize: 13, textAlign: 'center', marginTop: 24 }}>
                                    No matching sources found.
                                </Text>
                            ) : (
                                <>
                                    {citeResults.map(s => (
                                        <CitationCard
                                            key={s.id}
                                            source={s}
                                            query={selectionText}
                                            theme={theme}
                                            expanded={citeExpandedId === s.id}
                                            onToggle={() => setCiteExpandedId(citeExpandedId === s.id ? null : s.id)}
                                        />
                                    ))}

                                    {/* Verify section */}
                                    <View style={styles.verifySection}>
                                        {!citeAnalysis && !isAnalyzing && (
                                            <TouchableOpacity
                                                onPress={handleAnalyzeCitation}
                                                style={[styles.verifyBtn, { backgroundColor: theme.tint + '18', borderColor: theme.tint + '60' }]}
                                                accessibilityRole="button"
                                                accessibilityLabel="Verify citation against sources"
                                            >
                                                <Sparkles size={13} color={theme.tint} />
                                                <Text style={[styles.verifyBtnText, { color: theme.tint }]}>Verify</Text>
                                            </TouchableOpacity>
                                        )}

                                        {isAnalyzing && (
                                            <View style={styles.analyzingRow}>
                                                <ActivityIndicator size="small" color={theme.tint} />
                                                <Text style={[styles.analyzingText, { color: theme.secondary }]}>Analyzing…</Text>
                                            </View>
                                        )}

                                        {citeAnalysis && (
                                            <View style={styles.verdictSection}>
                                                <VerdictBadge supported={citeAnalysis.supported} theme={theme} />
                                                <Text style={[styles.verdictText, { color: theme.secondary }]}>
                                                    {citeAnalysis.verdict}
                                                </Text>

                                                <View style={styles.completionButtons}>
                                                    {citeAnalysis.completion.trim().length > 0 && (
                                                        <View style={styles.completionBtnRow}>
                                                            <TouchableOpacity
                                                                onPress={() => handleCopy(citeAnalysis.completion, 'completion')}
                                                                style={[styles.completionBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                                                                accessibilityRole="button"
                                                                accessibilityLabel="Copy sentence completion to clipboard"
                                                            >
                                                                <Text style={[styles.completionBtnText, { color: theme.text }]}>Complete sentence</Text>
                                                            </TouchableOpacity>
                                                            {copiedKey === 'completion' && (
                                                                <Text style={[styles.copiedLabel, { color: theme.success }]}>Copied!</Text>
                                                            )}
                                                        </View>
                                                    )}

                                                    <View style={styles.completionBtnRow}>
                                                        <TouchableOpacity
                                                            onPress={() => handleCopy(citeAnalysis.next_sentence, 'next')}
                                                            style={[styles.completionBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                                                            accessibilityRole="button"
                                                            accessibilityLabel="Copy next sentence suggestion to clipboard"
                                                        >
                                                            <Text style={[styles.completionBtnText, { color: theme.text }]}>Write next sentence</Text>
                                                        </TouchableOpacity>
                                                        {copiedKey === 'next' && (
                                                            <Text style={[styles.copiedLabel, { color: theme.success }]}>Copied!</Text>
                                                        )}
                                                    </View>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                </>
                            )}
                        </ScrollView>
                    </View>
                )}

                {citeResults === null && (isFetchingFeedback ? (
                    <View style={styles.feedbackLoading}>
                        <ActivityIndicator size="large" color={theme.tint} />
                        <Text style={[styles.feedbackLoadingText, { color: theme.secondary }]}>
                            Reviewing your writing against the archive…
                        </Text>
                    </View>
                ) : selectedNote?.ai_feedback ? (
                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                        {selectedNote.feedback_at && (
                            <View style={styles.feedbackTimestamp}>
                                <Clock size={11} color={theme.icon} />
                                <Text style={[styles.feedbackTimestampText, { color: theme.icon }]}>
                                    Reviewed {formatRelative(selectedNote.feedback_at)}
                                </Text>
                            </View>
                        )}

                        {selectedNote.ai_feedback.tone ? (
                            <Text style={[styles.toneText, { color: theme.secondary }]}>
                                "{selectedNote.ai_feedback.tone}"
                            </Text>
                        ) : null}

                        <FeedbackSection
                            title="Sources Confirm"
                            icon={<CheckCircle size={14} color={theme.success} />}
                            items={selectedNote.ai_feedback.accurate}
                            color={theme.success}
                            theme={theme}
                        />
                        <FeedbackSection
                            title="Worth Checking"
                            icon={<AlertTriangle size={14} color={theme.warning} />}
                            items={selectedNote.ai_feedback.concerns}
                            color={theme.warning}
                            theme={theme}
                        />
                        <FeedbackSection
                            title="Suggestions"
                            icon={<Lightbulb size={14} color={theme.tint} />}
                            items={selectedNote.ai_feedback.suggestions}
                            color={theme.tint}
                            theme={theme}
                        />

                        {selectedNote.matched_sources && selectedNote.matched_sources.length > 0 && (
                            <View style={styles.sourcesSection}>
                                <Text style={[styles.sourcesSectionLabel, { color: theme.secondary }]}>
                                    Sources consulted
                                </Text>
                                <View style={styles.sourceChips}>
                                    {selectedNote.matched_sources.map(s => (
                                        <SourceChip
                                            key={s.id}
                                            source={s}
                                            color={theme.primary}
                                            theme={theme}
                                            expandedId={expandedSourceId}
                                            onToggle={id => setExpandedSourceId(expandedSourceId === id ? null : id)}
                                        />
                                    ))}
                                </View>
                            </View>
                        )}

                        {selectedNote.recommended_sources && selectedNote.recommended_sources.length > 0 && (
                            <View style={[styles.sourcesSection, { marginTop: 16 }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                    <Library size={11} color={theme.tint} />
                                    <Text style={[styles.sourcesSectionLabel, { color: theme.tint, marginBottom: 0 }]}>
                                        Also in the archive
                                    </Text>
                                </View>
                                <Text style={[styles.recommendedHint, { color: theme.icon }]}>
                                    Relevant sources you haven't referenced yet — worth a look.
                                </Text>
                                <View style={styles.sourceChips}>
                                    {selectedNote.recommended_sources.map(s => (
                                        <SourceChip
                                            key={s.id}
                                            source={s}
                                            color={theme.tint}
                                            theme={theme}
                                            expandedId={expandedSourceId}
                                            onToggle={id => setExpandedSourceId(expandedSourceId === id ? null : id)}
                                        />
                                    ))}
                                </View>
                            </View>
                        )}
                    </ScrollView>
                ) : (
                    <View style={styles.feedbackEmpty}>
                        <Sparkles size={36} color={theme.border} />
                        <Text style={[styles.feedbackEmptyTitle, { color: theme.secondary }]}>
                            No feedback yet
                        </Text>
                        <Text style={[styles.feedbackEmptyHint, { color: theme.icon }]}>
                            Write something and hit "Get Feedback" — the AI will cross-reference your writing against your indexed sources.
                        </Text>
                    </View>
                ))}
            </View>

            {/* ── Inline citation tooltip ── */}
            {Platform.OS === 'web' && tooltipPos && selectionText && (
                <View style={{
                    // @ts-ignore — position: fixed is valid in RN Web
                    position: 'fixed',
                    top: tooltipPos.top,
                    left: tooltipPos.left,
                    zIndex: 9999,
                    transform: [{ translateX: -36 }],
                }}>
                    <TouchableOpacity
                        onPress={handleCite}
                        style={[styles.citeTooltip, { backgroundColor: theme.card, borderColor: theme.border }]}
                    >
                        {isCiting
                            ? <ActivityIndicator size="small" color={theme.tint} />
                            : <Quote size={12} color={theme.tint} />
                        }
                        <Text style={[styles.citeTooltipText, { color: theme.tint }]}>
                            {isCiting ? 'Searching…' : 'Cite'}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* ── New Note Modal ── */}
            <Modal transparent visible={newNoteModal} animationType="fade" onRequestClose={() => setNewNoteModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.newNoteModal, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        {!kickstartMode ? (
                            // Step 1: Choose mode
                            <>
                                <Text style={[styles.modalTitle, { color: theme.text, fontFamily: Fonts?.heading }]}>New Note</Text>
                                <View style={styles.newNoteChoices}>
                                    <TouchableOpacity
                                        onPress={handleBlankNote}
                                        style={[styles.choiceCard, { borderColor: theme.border, backgroundColor: theme.background }]}
                                    >
                                        <Text style={{ fontSize: 28 }}>📄</Text>
                                        <Text style={[styles.choiceTitle, { color: theme.text }]}>Start Blank</Text>
                                        <Text style={[styles.choiceDesc, { color: theme.secondary }]}>Open an empty note and write from scratch.</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => setKickstartMode(true)}
                                        style={[styles.choiceCard, { borderColor: theme.primary, backgroundColor: theme.primary + '0C' }]}
                                    >
                                        <Text style={{ fontSize: 28 }}>✨</Text>
                                        <Text style={[styles.choiceTitle, { color: theme.primary }]}>Kickstart with AI</Text>
                                        <Text style={[styles.choiceDesc, { color: theme.secondary }]}>Describe what you want — GPT pulls from your sources and drafts it.</Text>
                                    </TouchableOpacity>
                                </View>
                                <TouchableOpacity onPress={() => setNewNoteModal(false)} style={styles.modalCancelRow}>
                                    <Text style={{ color: theme.secondary, fontSize: 13 }}>Cancel</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            // Step 2: Kickstart form
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <TouchableOpacity onPress={() => setKickstartMode(false)} style={styles.backRow}>
                                    <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>← Back</Text>
                                </TouchableOpacity>
                                <Text style={[styles.modalTitle, { color: theme.text, fontFamily: Fonts?.heading }]}>Kickstart with AI</Text>

                                <Text style={[styles.ksLabel, { color: theme.secondary }]}>What do you want to write about?</Text>
                                <TextInput
                                    style={[styles.ksPromptInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                                    placeholder="e.g. The summer my grandfather left the village..."
                                    placeholderTextColor={theme.icon}
                                    value={ksPrompt}
                                    onChangeText={setKsPrompt}
                                    multiline
                                    autoFocus
                                />

                                <Text style={[styles.ksLabel, { color: theme.secondary }]}>Note Type</Text>
                                <View style={styles.ksPills}>
                                    {(['note', 'scene', 'chapter'] as NoteType[]).map(t => (
                                        <TouchableOpacity
                                            key={t}
                                            onPress={() => setKsType(t)}
                                            style={[styles.ksPill, { borderColor: ksType === t ? theme.primary : theme.border, backgroundColor: ksType === t ? theme.primary + '18' : 'transparent' }]}
                                        >
                                            <Text style={{ fontSize: 12, fontWeight: '600', color: ksType === t ? theme.primary : theme.secondary, textTransform: 'capitalize' }}>{t}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <Text style={[styles.ksLabel, { color: theme.secondary }]}>Length</Text>
                                <View style={styles.ksPills}>
                                    {([['short', '~300 words'], ['medium', '~600 words'], ['long', '~1200 words']] as const).map(([val, label]) => (
                                        <TouchableOpacity
                                            key={val}
                                            onPress={() => setKsLength(val)}
                                            style={[styles.ksPill, { borderColor: ksLength === val ? theme.primary : theme.border, backgroundColor: ksLength === val ? theme.primary + '18' : 'transparent' }]}
                                        >
                                            <Text style={{ fontSize: 12, fontWeight: '600', color: ksLength === val ? theme.primary : theme.secondary }}>{label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <Text style={[styles.ksLabel, { color: theme.secondary }]}>Format</Text>
                                <View style={styles.ksFormatPills}>
                                    {([
                                        ['prose',   'Flowing Prose',   'Ready-to-edit sentences, book-quality writing'],
                                        ['outline', 'Bullet Outline',  'Key points to expand — good for planning'],
                                        ['rough',   'Rough Draft',     'Full sentences with [EXPAND] markers where you need to add detail'],
                                    ] as const).map(([val, label, desc]) => (
                                        <TouchableOpacity
                                            key={val}
                                            onPress={() => setKsFormat(val)}
                                            style={[styles.formatCard, { borderColor: ksFormat === val ? theme.primary : theme.border, backgroundColor: ksFormat === val ? theme.primary + '0C' : 'transparent' }]}
                                        >
                                            <Text style={{ fontSize: 13, fontWeight: '700', color: ksFormat === val ? theme.primary : theme.text }}>{label}</Text>
                                            <Text style={{ fontSize: 11, color: theme.secondary, marginTop: 2 }}>{desc}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <View style={styles.ksActions}>
                                    <TouchableOpacity onPress={() => setNewNoteModal(false)} style={[styles.modalBtn, { backgroundColor: theme.border }]}>
                                        <Text style={{ color: theme.text, fontWeight: '600' }}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={handleKickstart}
                                        disabled={!ksPrompt.trim() || isKickstarting}
                                        style={[styles.modalBtn, { backgroundColor: theme.primary, opacity: !ksPrompt.trim() || isKickstarting ? 0.5 : 1, flexDirection: 'row', gap: 8 }]}
                                    >
                                        {isKickstarting
                                            ? <ActivityIndicator size="small" color="#fff" />
                                            : <Text style={{ fontSize: 14 }}>✨</Text>
                                        }
                                        <Text style={{ color: '#fff', fontWeight: '700' }}>{isKickstarting ? 'Generating…' : 'Generate'}</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* ── Delete Confirmation Modal ── */}
            <Modal transparent visible={deleteModalVisible} animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.modalTitle, { color: theme.text }]}>Delete Note?</Text>
                        <Text style={[styles.modalBody, { color: theme.secondary }]}>
                            "{selectedNote?.title || 'Untitled'}" will be permanently deleted.
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
        </View>
    );
}

function extractRelevantExcerpt(transcription: string, query: string, maxChars = 300): string {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const sentences = transcription.split(/(?<=[.!?])\s+/);
    let best = sentences[0] ?? '';
    let bestScore = 0;
    for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        const score = queryWords.filter(w => lower.includes(w)).length;
        if (score > bestScore) { bestScore = score; best = sentence; }
    }
    return best.length > maxChars ? best.slice(0, maxChars) + '…' : best;
}

interface CitationCardProps {
    source: SourceSearchResult;
    query: string;
    theme: typeof Colors.dark;
    expanded: boolean;
    onToggle: () => void;
}

function CitationCard({ source, query, theme, expanded, onToggle }: CitationCardProps) {
    const chips = [
        ...(source.people ?? []).map(p => ({ label: p, color: theme.primary })),
        ...(source.locations ?? []).map(l => ({ label: l, color: theme.tint })),
        ...(source.keywords ?? []).slice(0, 3).map(k => ({ label: k, color: theme.secondary })),
    ];

    const excerpt = source.transcription ? extractRelevantExcerpt(source.transcription, query) : null;

    return (
        <View style={[styles.citationCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
            <TouchableOpacity style={styles.citationCardHeader} onPress={onToggle}>
                <Text style={[styles.citationCardTitle, { color: theme.text }]} numberOfLines={1}>
                    {source.title || 'Untitled Source'}
                </Text>
                <Text style={{ color: theme.secondary, fontSize: 10, marginLeft: 4 }}>
                    {expanded ? '▲' : '▼'}
                </Text>
            </TouchableOpacity>
            {expanded && (
                <View style={styles.citationCardBody}>
                    {source.summary ? (
                        <Text style={[styles.citationCardSummary, { color: theme.secondary }]}>
                            {source.summary}
                        </Text>
                    ) : null}
                    {excerpt ? (
                        <View style={[styles.excerptBlock, { borderLeftColor: theme.tint }]}>
                            <Text style={[styles.excerptText, { color: theme.secondary }]}>
                                {excerpt}
                            </Text>
                        </View>
                    ) : null}
                    {chips.length > 0 && (
                        <View style={styles.citationChips}>
                            {chips.map((c, i) => (
                                <View key={i} style={[styles.citationChip, { backgroundColor: c.color + '20' }]}>
                                    <Text style={[styles.citationChipText, { color: c.color }]}>{c.label}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}

interface VerdictBadgeProps {
    supported: 'yes' | 'partial' | 'no';
    theme: typeof Colors.dark;
}

function VerdictBadge({ supported, theme }: VerdictBadgeProps) {
    const config = {
        yes:     { label: '✓ Supported by sources',   bg: theme.success + '20', text: theme.success },
        partial: { label: '~ Partially supported',     bg: theme.warning + '20', text: theme.warning },
        no:      { label: '✗ Not found in sources',    bg: theme.error   + '20', text: theme.error   },
    }[supported];

    return (
        <View style={[styles.verdictBadge, { backgroundColor: config.bg }]}>
            <Text style={[styles.verdictBadgeText, { color: config.text }]}>{config.label}</Text>
        </View>
    );
}

function SourceChip({
    source, color, theme, expandedId, onToggle,
}: {
    source: MatchedSource;
    color: string;
    theme: typeof Colors.dark;
    expandedId: string | null;
    onToggle: (id: string) => void;
}) {
    const expanded = expandedId === source.id;
    return (
        <View style={{ width: '100%' }}>
            <TouchableOpacity
                onPress={() => onToggle(source.id)}
                style={[
                    styles.sourceChip,
                    {
                        backgroundColor: expanded ? color + '30' : color + '18',
                        borderColor: expanded ? color + '80' : color + '40',
                    },
                ]}
            >
                <Text style={[styles.sourceChipText, { color, flex: 1 }]} numberOfLines={1}>
                    {source.title || 'Untitled Source'}
                </Text>
                <Text style={{ color, fontSize: 10, marginLeft: 4 }}>
                    {expanded ? '▲' : '▼'}
                </Text>
            </TouchableOpacity>
            {expanded && (
                <View style={[styles.sourceExpanded, { backgroundColor: color + '0C', borderColor: color + '30' }]}>
                    {source.summary ? (
                        <Text style={[styles.sourceExpandedText, { color: theme.secondary, marginBottom: source.tidbits?.length ? 10 : 0 }]}>
                            {source.summary}
                        </Text>
                    ) : (
                        <Text style={[styles.sourceExpandedText, { color: theme.icon, marginBottom: source.tidbits?.length ? 10 : 0 }]}>
                            No summary — index this source in the Vault to add one.
                        </Text>
                    )}
                    {source.tidbits?.map((quote, i) => (
                        <View
                            key={i}
                            style={[styles.tidbit, { borderLeftColor: color, backgroundColor: color + '12' }]}
                        >
                            <Text style={[styles.tidbitText, { color: theme.text }]}>
                                "{quote}"
                            </Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

function FeedbackSection({
    title, icon, items, color, theme,
}: {
    title: string;
    icon: React.ReactNode;
    items: string[];
    color: string;
    theme: typeof Colors.dark;
}) {
    if (!items || items.length === 0) return null;
    return (
        <View style={[styles.feedbackSection, { borderLeftColor: color }]}>
            <View style={styles.feedbackSectionHeader}>
                {icon}
                <Text style={[styles.feedbackSectionTitle, { color }]}>{title}</Text>
            </View>
            {items.map((item, i) => (
                <View key={i} style={styles.feedbackItem}>
                    <View style={[styles.feedbackDot, { backgroundColor: color }]} />
                    <Text style={[styles.feedbackItemText, { color: theme.text }]}>{item}</Text>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, flexDirection: 'row' },

    // Sidebar
    sidebar: {
        width: 220,
        borderRightWidth: 1,
        paddingTop: 16,
        paddingHorizontal: 12,
        paddingBottom: 12,
    },
    newBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 10,
        borderRadius: 8,
        marginBottom: 16,
    },
    newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    emptyHint: { fontSize: 12, textAlign: 'center', marginTop: 24, lineHeight: 18 },
    noteCard: {
        padding: 12,
        borderRadius: 8,
        marginBottom: 4,
        borderLeftWidth: 3,
    },
    noteCardTitle: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
    noteCardPreview: { fontSize: 11, lineHeight: 16, marginBottom: 6 },
    noteCardDate: { fontSize: 10 },
    typeBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
    typeBadgeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

    // Editor
    editor: { flex: 1, flexDirection: 'column', borderRightWidth: 1 },
    editorTopBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    typePills: { flexDirection: 'row', gap: 6 },
    typePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
    },
    typePillText: { fontSize: 12, fontWeight: '600' },
    deleteBtn: { padding: 6 },
    titleInput: {
        fontSize: 26,
        fontWeight: '700',
        fontFamily: Fonts?.heading ?? 'serif',
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 12,
        borderBottomWidth: 1,
    },
    contentInput: {
        flex: 1,
        fontSize: 16,
        lineHeight: 28,
        fontFamily: Fonts?.heading ?? 'serif',
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 20,
    },
    editorBottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderTopWidth: 1,
    },
    wordCount: { fontSize: 12 },
    editorActions: { flexDirection: 'row', gap: 10 },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
    },
    actionBtnText: { fontSize: 13, fontWeight: '600' },
    editorEmpty: { justifyContent: 'center', alignItems: 'center', gap: 16 },
    editorEmptyText: { fontSize: 14, textAlign: 'center', maxWidth: 280, lineHeight: 22 },

    // Feedback panel
    feedbackPanel: { width: 320, borderLeftWidth: 1, flexDirection: 'column' },
    feedbackHeader: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        padding: 16,
        borderBottomWidth: 1,
    },
    feedbackLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
    feedbackLoadingText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
    feedbackEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
    feedbackEmptyTitle: { fontSize: 15, fontWeight: '600' },
    feedbackEmptyHint: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
    feedbackTimestamp: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
    },
    feedbackTimestampText: { fontSize: 11 },
    toneText: { fontSize: 13, fontStyle: 'italic', lineHeight: 20, paddingHorizontal: 16, paddingVertical: 10 },
    feedbackSection: { marginHorizontal: 16, marginTop: 12, paddingLeft: 12, borderLeftWidth: 2 },
    feedbackSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    feedbackSectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    feedbackItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
    feedbackDot: { width: 5, height: 5, borderRadius: 3, marginTop: 6, flexShrink: 0 },
    feedbackItemText: { fontSize: 13, lineHeight: 20, flex: 1 },
    sourcesSection: { marginHorizontal: 16, marginTop: 20, marginBottom: 24 },
    sourcesSectionLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    recommendedHint: { fontSize: 11, lineHeight: 16, marginBottom: 8 },
    sourceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    sourceChip: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, width: '100%', flexDirection: 'row', alignItems: 'center' },
    sourceChipText: { fontSize: 11, fontWeight: '600' },
    sourceExpanded: { borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, padding: 10 },
    sourceExpandedText: { fontSize: 12, lineHeight: 18 },
    tidbit: { borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, marginTop: 6 },
    tidbitText: { fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
    modalOverlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: 360, padding: 24, borderRadius: 16, borderWidth: 1 },
    modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
    modalBody: { fontSize: 14, lineHeight: 22, marginBottom: 24 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
    modalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

    // New note modal
    newNoteModal: { width: 480, maxHeight: '85%', padding: 28, borderRadius: 16, borderWidth: 1 },
    newNoteChoices: { flexDirection: 'row', gap: 16, marginBottom: 20 },
    choiceCard: { flex: 1, borderWidth: 1.5, borderRadius: 12, padding: 20, alignItems: 'center', gap: 10 },
    choiceTitle: { fontSize: 15, fontWeight: '700' },
    choiceDesc: { fontSize: 12, textAlign: 'center', lineHeight: 17 },
    modalCancelRow: { alignItems: 'center', paddingTop: 4 },
    backRow: { marginBottom: 12 },

    // Citation tooltip
    citeTooltip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 6,
    },
    citeTooltipText: { fontSize: 12, fontWeight: '700' },
    citationCard: {
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 8,
        overflow: 'hidden',
    },
    citationCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 10,
    },
    citationCardTitle: { fontSize: 12, fontWeight: '600', flex: 1 },
    citationCardBody: { paddingHorizontal: 10, paddingBottom: 10 },
    citationCardSummary: { fontSize: 12, lineHeight: 18 },
    citationChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
    citationChip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    citationChipText: { fontSize: 10, fontWeight: '600' },

    // Excerpt blockquote
    excerptBlock: {
        borderLeftWidth: 3,
        paddingLeft: 10,
        paddingVertical: 6,
        marginTop: 8,
        marginBottom: 4,
    },
    excerptText: { fontSize: 12, lineHeight: 18, fontStyle: 'italic' },

    // Verify / verdict
    verifySection: { marginTop: 16 },
    verifyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        alignSelf: 'flex-start',
    },
    verifyBtnText: { fontSize: 13, fontWeight: '600' },
    analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    analyzingText: { fontSize: 13 },
    verdictSection: { gap: 10 },
    verdictBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
    verdictBadgeText: { fontSize: 12, fontWeight: '700' },
    verdictText: { fontSize: 12, lineHeight: 18 },
    completionButtons: { gap: 8, marginTop: 4 },
    completionBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    completionBtn: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    completionBtnText: { fontSize: 12, fontWeight: '600' },
    copiedLabel: { fontSize: 11, fontWeight: '600' },

    // Kickstart form
    ksLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginTop: 16 },
    ksPromptInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, lineHeight: 22, minHeight: 80, textAlignVertical: 'top' },
    ksPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    ksPill: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
    ksFormatPills: { gap: 8 },
    formatCard: { borderWidth: 1.5, borderRadius: 10, padding: 12 },
    ksActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 24, marginBottom: 4 },
});
