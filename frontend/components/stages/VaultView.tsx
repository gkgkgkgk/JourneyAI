import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Image, Modal, ScrollView, TextInput, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { UploadCloud, CheckCircle2, Loader2, Info, X, Trash2, ScanText, Edit, DatabaseZap, Users, MapPin, Calendar, Tag, Mic, Save, Check, CheckSquare, Film, FileText } from 'lucide-react-native';
import AudioPlayer from '@/components/AudioPlayer';
import { Colors, Fonts } from '@/constants/theme';
import { useAppColorScheme } from '@/context/JourneyContext';
import { uploadFile, getSources, deleteSource, updateSource, BASE_URL, streamSSE, convertToAudio } from '@/api/client';

export default function VaultView() {
  const colorScheme = useAppColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState<any>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<string | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [transcribeStatus, setTranscribeStatus] = useState('');
  const [indexingStatus, setIndexingStatus] = useState('');

  const [editTitle, setEditTitle] = useState('');
  const [isTitleFocused, setIsTitleFocused] = useState(false);

  // Transcript modal state
  const [transcriptModalVisible, setTranscriptModalVisible] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);
  const [transcriptLastSaved, setTranscriptLastSaved] = useState<Date | null>(null);
  const [transcriptSavedLabel, setTranscriptSavedLabel] = useState('');

  // Multi-select state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [bulkDeleteConfirmVisible, setBulkDeleteConfirmVisible] = useState(false);
  const [convertModalSource, setConvertModalSource] = useState<any>(null);
  const [pendingFiles, setPendingFiles] = useState<{
    file: any;
    isVideo: boolean;
    transcribe: boolean;
    index: boolean;
    convertAudio: boolean;
  }[] | null>(null);

  // Ref for auto-save debounce timer
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to track whether we're currently in the modal (so auto-save can reference selectedSource)
  const selectedSourceRef = useRef<any>(null);
  selectedSourceRef.current = selectedSource;

  useEffect(() => {
    loadSources();
  }, []);

  useEffect(() => {
    setEditTitle(selectedSource?.title ?? '');
  }, [selectedSource?.id]);

  // Auto-save: 2s after user stops typing
  useEffect(() => {
    if (!transcriptModalVisible) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    autoSaveTimer.current = setTimeout(async () => {
      const source = selectedSourceRef.current;
      if (!source) return;
      try {
        setIsSavingTranscript(true);
        await updateSource(source.id, { transcription: editContent });
        // Update sources list and selectedSource silently
        setSources(prev => prev.map(s => s.id === source.id ? { ...s, transcription: editContent } : s));
        setSelectedSource((prev: any) => prev ? { ...prev, transcription: editContent } : prev);
        setTranscriptLastSaved(new Date());
      } catch (e) {
        console.error('Auto-save failed:', e);
      } finally {
        setIsSavingTranscript(false);
      }
    }, 2000);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [editContent, transcriptModalVisible]);

  // Tick: update "Saved X ago" label every second
  useEffect(() => {
    if (!transcriptLastSaved) {
      setTranscriptSavedLabel('');
      return;
    }

    const update = () => {
      const diffMs = Date.now() - transcriptLastSaved.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 5) {
        setTranscriptSavedLabel('Saved just now');
      } else if (diffSec < 60) {
        setTranscriptSavedLabel(`Saved ${diffSec}s ago`);
      } else {
        const diffMin = Math.floor(diffSec / 60);
        setTranscriptSavedLabel(`Saved ${diffMin}m ago`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [transcriptLastSaved]);

  const loadSources = async () => {
    try {
      const data = await getSources();
      const mapped = data.map((s: any) => ({
        ...s,
        uri: `${BASE_URL as string}/uploads/${s.stored_filename}`
      }));
      setSources(mapped);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf', 'audio/*', 'video/*', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      setPendingFiles(result.assets.map(file => {
        const isVideo = (file.mimeType ?? '').startsWith('video/');
        return { file, isVideo, transcribe: true, index: true, convertAudio: isVideo };
      }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmUpload = async () => {
    if (!pendingFiles) return;
    const files = pendingFiles;
    setPendingFiles(null);

    const entries = files.map(f => ({
      ...f,
      tempId: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    }));

    setSources(prev => [
      ...entries.map(({ file, tempId }) => ({
        ...file,
        _uploading: true,
        id: tempId,
        original_filename: file.name,
      })),
      ...prev,
    ]);

    const results = await Promise.allSettled(
      entries.map(({ file, tempId, transcribe, index, convertAudio, isVideo }) =>
        uploadFile(file)
          .then(uploaded => {
            const uri = `${BASE_URL as string}/uploads/${uploaded.stored_filename}`;
            setSources(prev => prev.map(s => s.id === tempId ? { ...uploaded, uri } : s));
            return { uploaded: { ...uploaded, uri }, tempId, transcribe, index, convertAudio, isVideo };
          })
          .catch(err => {
            console.error(err);
            setSources(prev => prev.map(s => s.id === tempId ? { ...s, _uploading: false, _error: true } : s));
            throw err;
          })
      )
    );

    for (const r of results) {
      if (r.status === 'rejected') continue;
      const { uploaded, transcribe, index, convertAudio, isVideo } = r.value;
      let sourceId = uploaded.id;
      let canProcess = !isVideo;

      if (isVideo && convertAudio) {
        setSources(prev => prev.map(s => s.id === sourceId ? { ...s, _converting: true } : s));
        try {
          const audio = await convertToAudio(sourceId);
          const uri = `${BASE_URL as string}/uploads/${audio.stored_filename}`;
          setSources(prev => prev.map(s => s.id === sourceId ? { ...audio, uri } : s));
          sourceId = audio.id;
          canProcess = true;
        } catch (e) {
          console.error('Convert failed', e);
          setSources(prev => prev.map(s => s.id === sourceId ? { ...s, _converting: false, _error: true } : s));
          continue;
        }
      }

      if (canProcess && transcribe) {
        await handleGenerateTranscription(sourceId);
      }
      if (canProcess && transcribe && index) {
        await handleIndex(sourceId);
      }
    }
  };

  const promptDelete = (id: string) => {
    setSourceToDelete(id);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!sourceToDelete) return;
    try {
      await deleteSource(sourceToDelete);
      setSources(prev => prev.filter(s => s.id !== sourceToDelete));
      setSelectedSource(null);
    } catch (e) {
      console.error('Failed to delete source', e);
    } finally {
      setDeleteModalVisible(false);
      setSourceToDelete(null);
    }
  };

  const handleGenerateTranscription = async (id: string) => {
    setTranscribingId(id);
    setStreamingText('');
    setTranscribeStatus('Connecting…');
    try {
      for await (const event of streamSSE(`/api/sources/${id}/transcribe/stream`)) {
        if (event.type === 'status') {
          setTranscribeStatus(event.message);
        } else if (event.type === 'token') {
          setStreamingText(prev => prev + event.text);
        } else if (event.type === 'done') {
          const constructedUri = `${BASE_URL as string}/uploads/${event.source.stored_filename}`;
          const updatedWithUri = { ...event.source, uri: constructedUri };
          setSources(prev => prev.map(s => s.id === id ? updatedWithUri : s));
          if (selectedSourceRef.current?.id === id) {
            setSelectedSource(updatedWithUri);
            // Populate edit content with the fresh transcription if modal is open
            setEditContent(updatedWithUri.transcription || '');
          }
          setTranscribingId(null);
          setStreamingText('');
          setTranscribeStatus('');
        } else if (event.type === 'error') {
          setSources(prev => prev.map(s => s.id === id ? { ...s, _error: true } : s));
          setTranscribingId(null);
          setStreamingText('');
          setTranscribeStatus('');
        }
      }
    } catch (e) {
      console.error(e);
      setTranscribingId(null);
      setStreamingText('');
      setTranscribeStatus('');
    }
  };

  const handleIndex = async (id: string) => {
    setIsIndexing(true);
    setIndexingStatus('Starting…');
    try {
      for await (const event of streamSSE(`/api/sources/${id}/index/stream`)) {
        if (event.type === 'status') {
          setIndexingStatus(event.message);
        } else if (event.type === 'done') {
          setSources(prev => prev.map(s => s.id === id ? { ...event.source, uri: s.uri } : s));
          if (selectedSourceRef.current?.id === id) {
            setSelectedSource((prev: any) => ({ ...prev, ...event.source }));
          }
          setIsIndexing(false);
          setIndexingStatus('');
        } else if (event.type === 'error') {
          console.error('Indexing failed:', event.message);
          setIsIndexing(false);
          setIndexingStatus('');
        }
      }
    } catch (e) {
      console.error(e);
      setIsIndexing(false);
      setIndexingStatus('');
    }
  };

  const [titleSaved, setTitleSaved] = useState(false);

  useEffect(() => {
    if (!selectedSource) return;
    if (editTitle === (selectedSource.title ?? '')) return;
    const timer = setTimeout(async () => {
      const source = selectedSourceRef.current;
      if (!source) return;
      try {
        const updated = await updateSource(source.id, { title: editTitle.trim() || null });
        const withUri = { ...updated, uri: source.uri };
        setSources(prev => prev.map(s => s.id === source.id ? withUri : s));
        setSelectedSource(withUri);
        setTitleSaved(true);
        setTimeout(() => setTitleSaved(false), 2000);
      } catch (e) {
        console.error('Failed to save title', e);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [editTitle]);

  const openTranscriptEditor = () => {
    if (!selectedSource) return;
    setEditContent(selectedSource.transcription || '');
    setTranscriptLastSaved(null);
    setTranscriptSavedLabel('');
    setTranscriptModalVisible(true);
  };

  const saveTranscriptAndClose = async () => {
    if (!selectedSource) return;
    // Cancel pending auto-save timer — we're saving now
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    try {
      setIsSavingTranscript(true);
      const updated = await updateSource(selectedSource.id, { transcription: editContent });
      const constructedUri = `${BASE_URL as string}/uploads/${updated.stored_filename}`;
      const updatedWithUri = { ...updated, uri: constructedUri };
      setSources(prev => prev.map(s => s.id === selectedSource.id ? updatedWithUri : s));
      setSelectedSource(updatedWithUri);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingTranscript(false);
      setTranscriptModalVisible(false);
    }
  };

  const closeTranscriptModal = () => {
    // Auto-save already ran; just close
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setTranscriptModalVisible(false);
  };

  // --- Multi-select handlers ---

  const toggleSelectionMode = () => {
    setSelectionMode(prev => !prev);
    setSelectedIds(new Set());
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(
      sources.filter(s => !s._uploading && !s._error).map(s => s.id)
    ));
  };

  const runBulkTranscribe = async () => {
    const ids = Array.from(selectedIds).filter(id => {
      const s = sources.find(s => s.id === id);
      return s && !s._uploading && !s._error;
    });
    if (!ids.length) return;
    setSelectionMode(false);
    setSelectedIds(new Set());
    for (let i = 0; i < ids.length; i++) {
      setBulkProgress({ current: i + 1, total: ids.length, label: 'Transcribing' });
      await handleGenerateTranscription(ids[i]);
    }
    setBulkProgress(null);
  };

  const runBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkDeleteConfirmVisible(false);
    setSelectionMode(false);
    setSelectedIds(new Set());
    for (let i = 0; i < ids.length; i++) {
      setBulkProgress({ current: i + 1, total: ids.length, label: 'Deleting' });
      try {
        await deleteSource(ids[i]);
        setSources(prev => prev.filter(s => s.id !== ids[i]));
        if (selectedSourceRef.current?.id === ids[i]) setSelectedSource(null);
      } catch (e) {
        console.error('Failed to delete source', ids[i], e);
      }
    }
    setBulkProgress(null);
  };

  const handleConvertToAudio = async () => {
    if (!convertModalSource) return;
    const source = convertModalSource;
    setConvertModalSource(null);
    setSources(prev => prev.map(s => s.id === source.id ? { ...s, _converting: true } : s));
    try {
      const audioSource = await convertToAudio(source.id);
      const constructedUri = `${BASE_URL as string}/uploads/${audioSource.stored_filename}`;
      setSources(prev => prev.map(s => s.id === source.id ? { ...audioSource, uri: constructedUri } : s));
    } catch (e) {
      console.error('Convert to audio failed', e);
      setSources(prev => prev.map(s => s.id === source.id ? { ...s, _converting: false, _error: true } : s));
    }
  };

  const runBulkIndex = async () => {
    // Only include sources that have a transcription
    const ids = Array.from(selectedIds).filter(id => {
      const s = sources.find(s => s.id === id);
      return s && s.transcription && !s._uploading && !s._error;
    });
    if (!ids.length) return;
    setSelectionMode(false);
    setSelectedIds(new Set());
    for (let i = 0; i < ids.length; i++) {
      setBulkProgress({ current: i + 1, total: ids.length, label: 'Indexing' });
      await handleIndex(ids[i]);
    }
    setBulkProgress(null);
  };

  const isStreaming = selectedSource && transcribingId === selectedSource.id;

  // Counts for action bar labels
  const eligibleForTranscribe = Array.from(selectedIds).filter(id => {
    const s = sources.find(s => s.id === id);
    return s && !s._uploading && !s._error;
  }).length;

  const eligibleForIndex = Array.from(selectedIds).filter(id => {
    const s = sources.find(s => s.id === id);
    return s && s.transcription && !s._uploading && !s._error;
  }).length;

  return (
    <View style={styles.container}>
      {/* Upload Zone + Grid */}
      <View style={[styles.mainArea, { backgroundColor: theme.background }]}>
        <TouchableOpacity
          onPress={handleUpload}
          style={[styles.uploadBox, { borderColor: theme.border, backgroundColor: theme.card }]}
          accessibilityLabel="Upload sources"
          accessibilityRole="button"
        >
          <UploadCloud size={36} color={theme.primary} />
          <Text style={[styles.uploadHeading, { color: theme.text, fontFamily: Fonts?.heading }]}>
            Add Sources
          </Text>
          <Text style={[styles.uploadText, { color: theme.secondary }]}>
            Images, PDFs & audio — drop one or many
          </Text>
        </TouchableOpacity>

        {/* Toolbar: selection mode toggle / action bar / bulk progress */}
        {bulkProgress !== null ? (
          <View style={[styles.bulkBar, { backgroundColor: theme.card }]}>
            <Loader2 size={16} color={theme.secondary} />
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>
              {bulkProgress.label} {bulkProgress.current} of {bulkProgress.total}…
            </Text>
          </View>
        ) : selectionMode ? (
          <View style={[styles.toolbar, { backgroundColor: theme.card, borderBottomColor: theme.border, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, marginBottom: 16 }]}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
              {selectedIds.size} selected
            </Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={selectAll}
              style={styles.actionBtn}
              accessibilityLabel="Select all sources"
              accessibilityRole="button"
            >
              <Text style={{ color: theme.secondary, fontSize: 12, fontWeight: '600' }}>Select All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={runBulkTranscribe}
              disabled={eligibleForTranscribe === 0}
              style={[styles.actionBtn, { backgroundColor: theme.tint + '20', opacity: eligibleForTranscribe === 0 ? 0.4 : 1 }]}
              accessibilityLabel={`Transcribe ${eligibleForTranscribe} selected sources`}
              accessibilityRole="button"
            >
              <ScanText size={13} color={theme.tint} />
              <Text style={{ color: theme.tint, fontSize: 12, fontWeight: '600' }}>
                Transcribe ({eligibleForTranscribe})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={runBulkIndex}
              disabled={eligibleForIndex === 0}
              style={[styles.actionBtn, { backgroundColor: theme.primary + '20', opacity: eligibleForIndex === 0 ? 0.4 : 1 }]}
              accessibilityLabel={`Index ${eligibleForIndex} selected sources`}
              accessibilityRole="button"
            >
              <DatabaseZap size={13} color={theme.primary} />
              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600' }}>
                Index ({eligibleForIndex})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setBulkDeleteConfirmVisible(true)}
              disabled={selectedIds.size === 0}
              style={[styles.actionBtn, { backgroundColor: theme.error + '20', opacity: selectedIds.size === 0 ? 0.4 : 1 }]}
              accessibilityLabel={`Delete ${selectedIds.size} selected sources`}
              accessibilityRole="button"
            >
              <Trash2 size={13} color={theme.error} />
              <Text style={{ color: theme.error, fontSize: 12, fontWeight: '600' }}>
                Delete ({selectedIds.size})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={toggleSelectionMode}
              style={styles.actionBtn}
              accessibilityLabel="Cancel selection"
              accessibilityRole="button"
            >
              <X size={16} color={theme.icon} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.toolbar, { justifyContent: 'flex-end', marginBottom: 16 }]}>
            <TouchableOpacity
              onPress={toggleSelectionMode}
              style={[styles.selectBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
              accessibilityLabel="Enter selection mode"
              accessibilityRole="button"
            >
              <CheckSquare size={14} color={theme.icon} />
              <Text style={{ color: theme.icon, fontSize: 12, fontWeight: '600' }}>Select</Text>
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          data={sources}
          numColumns={3}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.gridContent}
          renderItem={({ item }) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <TouchableOpacity
                onPress={() => {
                  if (selectionMode) {
                    toggleSelectId(item.id);
                  } else {
                    setSelectedSource(item);
                  }
                }}
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: selectionMode && isSelected
                      ? theme.primary
                      : !selectionMode && selectedSource?.id === item.id
                        ? theme.primary
                        : theme.border,
                    borderWidth: selectionMode && isSelected ? 2 : 1,
                    shadowColor: (!selectionMode && selectedSource?.id === item.id) || (selectionMode && isSelected)
                      ? theme.primary
                      : '#000',
                    shadowOpacity: (!selectionMode && selectedSource?.id === item.id) || (selectionMode && isSelected)
                      ? 0.2
                      : 0.06,
                  }
                ]}
              >
                {/* Selection checkbox overlay */}
                {selectionMode && (
                  <View
                    style={[
                      styles.cardCheckbox,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.card,
                        borderWidth: isSelected ? 0 : 1.5,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    {isSelected && <Check size={13} color="#fff" />}
                  </View>
                )}

                <View style={[styles.cardPreview, { backgroundColor: theme.background }]}>
                  {item.content_type?.startsWith('audio/') ? (
                    <Mic size={36} color={theme.tint} />
                  ) : item._converting ? (
                    <Loader2 size={36} color={theme.secondary} />
                  ) : item.content_type?.startsWith('video/') ? (
                    <Film size={36} color={theme.icon} style={{ opacity: 0.4 }} />
                  ) : item.uri ? (
                    <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                  ) : (
                    <Info size={36} color={theme.icon} />
                  )}
                </View>
                <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                  {item.title && (
                    <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700', fontSize: 13, fontFamily: Fonts?.heading, marginBottom: 2 }}>{item.title}</Text>
                  )}
                  <Text numberOfLines={1} style={{ color: theme.secondary, fontWeight: '400', fontSize: 11 }}>{item.name || item.original_filename}</Text>
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                    {item._uploading ? (
                      <View style={[styles.statusBadge, { backgroundColor: theme.secondary + '18' }]}>
                        <Loader2 size={10} color={theme.secondary} />
                        <Text style={[styles.statusText, { color: theme.secondary }]}>Uploading</Text>
                      </View>
                    ) : item._converting ? (
                      <View style={[styles.statusBadge, { backgroundColor: theme.secondary + '18' }]}>
                        <Loader2 size={10} color={theme.secondary} />
                        <Text style={[styles.statusText, { color: theme.secondary }]}>Converting…</Text>
                      </View>
                    ) : item.content_type?.startsWith('video/') ? (
                      <View style={[styles.statusBadge, { backgroundColor: theme.icon + '14' }]}>
                        <Film size={10} color={theme.icon} />
                        <Text style={[styles.statusText, { color: theme.icon }]}>Video</Text>
                      </View>
                    ) : transcribingId === item.id ? (
                      <View style={[styles.statusBadge, { backgroundColor: theme.primary + '18' }]}>
                        <Loader2 size={10} color={theme.primary} />
                        <Text style={[styles.statusText, { color: theme.primary }]}>
                          {transcribeStatus || 'Transcribing'}
                        </Text>
                      </View>
                    ) : item._error ? (
                      <View style={[styles.statusBadge, { backgroundColor: theme.error + '18' }]}>
                        <Text style={[styles.statusText, { color: theme.error }]}>Error</Text>
                      </View>
                    ) : (
                      <>
                        {item.transcription ? (
                          <View style={[styles.statusBadge, { backgroundColor: theme.tint + '18' }]}>
                            <CheckCircle2 size={10} color={theme.tint} />
                            <Text style={[styles.statusText, { color: theme.tint }]}>Transcribed</Text>
                          </View>
                        ) : (
                          <View style={[styles.statusBadge, { backgroundColor: theme.icon + '14' }]}>
                            <Text style={[styles.statusText, { color: theme.icon }]}>No transcript</Text>
                          </View>
                        )}
                        {item.indexed_at ? (
                          <View style={[styles.statusBadge, { backgroundColor: theme.success + '18' }]}>
                            <CheckCircle2 size={10} color={theme.success} />
                            <Text style={[styles.statusText, { color: theme.success }]}>Indexed</Text>
                          </View>
                        ) : item.transcription ? (
                          <View style={[styles.statusBadge, { backgroundColor: theme.icon + '14' }]}>
                            <Text style={[styles.statusText, { color: theme.icon }]}>Not indexed</Text>
                          </View>
                        ) : null}
                      </>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Source Details Sidebar */}
      {selectedSource && (
        <View style={[styles.detailsPane, { backgroundColor: theme.card, borderLeftColor: theme.border }]}>
          <View style={styles.paneContentWrapper}>
            <View style={styles.paneHeader}>
              <Text style={[styles.sidebarHeader, { color: theme.text, flex: 1 }]} numberOfLines={1}>
                {selectedSource.name || selectedSource.original_filename}
              </Text>
              <TouchableOpacity onPress={() => setSelectedSource(null)}>
                <X size={20} color={theme.icon} />
              </TouchableOpacity>
            </View>

            {/* Editable Title */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                onFocus={() => setIsTitleFocused(true)}
                onBlur={() => setIsTitleFocused(false)}
                placeholder="Add a title…"
                placeholderTextColor={theme.secondary}
                style={[
                  styles.titleInput,
                  { color: theme.text, fontFamily: Fonts?.heading, flex: 1 },
                  isTitleFocused && { borderBottomColor: theme.border },
                ]}
                accessibilityLabel="Source title"
              />
              {titleSaved
                ? <Check size={13} color={theme.tint} />
                : <Edit size={13} color={theme.icon} />
              }
            </View>

            {/* File Viewer / Preview */}
            <View style={[styles.previewContainer, { borderColor: theme.border, backgroundColor: theme.background }]}>
              {selectedSource.mimeType?.startsWith('image/') || selectedSource.content_type?.startsWith('image/') || selectedSource.uri?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <Image
                  source={{ uri: selectedSource.uri || selectedSource.file_path }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              ) : selectedSource.mimeType === 'application/pdf' || selectedSource.content_type === 'application/pdf' ? (
                Platform.OS === 'web' ? (
                  <iframe
                    src={selectedSource.uri}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="PDF Preview"
                  />
                ) : (
                  <View style={styles.centeredMsg}>
                    <Text style={{ color: theme.secondary }}>PDF Preview not supported on native yet.</Text>
                  </View>
                )
              ) : selectedSource.content_type?.startsWith('audio/') ? (
                <AudioPlayer src={selectedSource.uri} />
              ) : (
                <View style={styles.centeredMsg}>
                  <Text style={{ color: theme.secondary }}>Preview not available.</Text>
                </View>
              )}
            </View>

            {/* Index Section */}
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={[styles.label, { color: theme.secondary }]}>Index:</Text>
                {selectedSource.transcription ? (
                  <TouchableOpacity
                    onPress={() => handleIndex(selectedSource.id)}
                    disabled={isIndexing}
                    style={[styles.smallBtn, { backgroundColor: isIndexing ? theme.border : theme.primary + '20' }]}
                  >
                    {isIndexing ? <Loader2 size={14} color={theme.primary} /> : <DatabaseZap size={14} color={theme.primary} />}
                    <Text style={[styles.btnText, { color: theme.primary }]}>
                      {isIndexing ? (indexingStatus || 'Indexing…') : selectedSource.indexed_at ? 'Re-index' : 'Index'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ fontSize: 11, color: theme.secondary, fontStyle: 'italic' }}>Transcribe first</Text>
                )}
              </View>

              {selectedSource.indexed_at && (
                <View style={[styles.indexCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  {selectedSource.summary ? (
                    <Text style={[styles.indexSummary, { color: theme.secondary }]}>{selectedSource.summary}</Text>
                  ) : null}
                  <IndexChips icon={<Tag size={11} color={theme.tint} />} label="Keywords" items={selectedSource.keywords} color={theme.tint} />
                  <IndexChips icon={<Users size={11} color={theme.success} />} label="People" items={selectedSource.people} color={theme.success} />
                  <IndexChips icon={<MapPin size={11} color={theme.primary} />} label="Locations" items={selectedSource.locations} color={theme.primary} />
                  <IndexChips icon={<Calendar size={11} color={theme.secondary} />} label="Timeline" items={selectedSource.timeline} color={theme.secondary} />
                </View>
              )}
            </View>

            {/* Transcription — read-only view with Generate + Edit buttons */}
            <Text style={[styles.label, { color: theme.secondary, marginTop: 8 }]}>AI Transcription:</Text>

            <View style={styles.transcriptionTools}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => handleGenerateTranscription(selectedSource.id)}
                  disabled={transcribingId === selectedSource.id}
                  style={[styles.smallBtn, { backgroundColor: theme.tint + '20', opacity: transcribingId === selectedSource.id ? 0.5 : 1 }]}
                >
                  <ScanText size={14} color={theme.tint} />
                  <Text style={[styles.btnText, { color: theme.tint }]}>Generate</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openTranscriptEditor}
                  style={[styles.smallBtn, { backgroundColor: theme.icon + '20' }]}
                  accessibilityLabel="Edit transcription"
                  accessibilityRole="button"
                >
                  <Edit size={14} color={theme.text} />
                  <Text style={[styles.btnText, { color: theme.text }]}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Read-only transcription box */}
            <View style={[styles.transcriptionBox, { backgroundColor: theme.background }]}>
              {transcribingId === selectedSource.id ? (
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.secondary, fontSize: 11, marginBottom: 8, fontStyle: 'italic' }}>
                    {transcribeStatus}
                  </Text>
                  <ScrollView>
                    <Text style={{ color: theme.text, lineHeight: 24, fontFamily: Fonts?.heading }}>
                      {streamingText}
                      <Text style={{ color: theme.primary }}>▊</Text>
                    </Text>
                  </ScrollView>
                </View>
              ) : (
                <ScrollView>
                  <Text style={{ color: theme.text, lineHeight: 24, fontFamily: Fonts?.heading }}>
                    {selectedSource.transcription || 'No transcription available.'}
                  </Text>
                </ScrollView>
              )}
            </View>
          </View>

          {/* Bottom Action: Delete */}
          <View style={[styles.paneFooter, { borderTopColor: theme.border }]}>
            <TouchableOpacity
              onPress={() => promptDelete(selectedSource.id)}
              style={[styles.deleteBtn, { backgroundColor: theme.error + '10' }]}
            >
              <Trash2 size={18} color={theme.error} />
              <Text style={{ color: theme.error, fontWeight: 'bold', marginLeft: 8 }}>Delete Source</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Transcript Editor Modal */}
      <Modal
        visible={transcriptModalVisible}
        animationType="fade"
        onRequestClose={closeTranscriptModal}
      >
        <View style={[styles.transcriptModalRoot, { backgroundColor: theme.background }]}>
          {/* Modal Header */}
          <View style={[styles.transcriptModalHeader, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={[styles.transcriptModalTitle, { color: theme.text, fontFamily: Fonts?.heading }]} numberOfLines={1}>
              {selectedSource?.title || selectedSource?.name || selectedSource?.original_filename || ''}
            </Text>
            <Text style={[styles.transcriptSavedLabel, { color: theme.secondary }]}>
              {isSavingTranscript ? 'Saving…' : transcriptSavedLabel}
            </Text>
            <TouchableOpacity
              onPress={closeTranscriptModal}
              style={[styles.modalCloseBtn, { backgroundColor: theme.border }]}
              accessibilityLabel="Close editor"
              accessibilityRole="button"
            >
              <X size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* Modal Body — split panes */}
          <View style={styles.transcriptModalBody}>
            {/* Left pane: document viewer */}
            <View style={[styles.transcriptLeftPane, { backgroundColor: theme.card, borderRightColor: theme.border }]}>
              {selectedSource?.mimeType?.startsWith('image/') || selectedSource?.content_type?.startsWith('image/') || selectedSource?.uri?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
                  <Image
                    source={{ uri: selectedSource?.uri || selectedSource?.file_path }}
                    style={styles.modalPreviewImage}
                    resizeMode="contain"
                  />
                </ScrollView>
              ) : selectedSource?.mimeType === 'application/pdf' || selectedSource?.content_type === 'application/pdf' ? (
                Platform.OS === 'web' ? (
                  <iframe
                    src={selectedSource?.uri}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="PDF Preview"
                  />
                ) : (
                  <View style={styles.centeredMsg}>
                    <Text style={{ color: theme.secondary }}>PDF Preview not supported on native.</Text>
                  </View>
                )
              ) : selectedSource?.content_type?.startsWith('audio/') ? (
                <View style={styles.centeredMsg}>
                  <AudioPlayer src={selectedSource?.uri} />
                </View>
              ) : (
                <View style={styles.centeredMsg}>
                  <Text style={{ color: theme.secondary }}>Preview not available.</Text>
                </View>
              )}
            </View>

            {/* Right pane: transcription editor */}
            <View style={[styles.transcriptRightPane, { backgroundColor: theme.background }]}>
              {isStreaming ? (
                // Show streaming output while transcription is generating
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.secondary, fontSize: 12, marginBottom: 12, fontStyle: 'italic' }}>
                    {transcribeStatus}
                  </Text>
                  <ScrollView style={{ flex: 1 }}>
                    <Text style={[styles.transcriptEditorText, { color: theme.text }]}>
                      {streamingText}
                      <Text style={{ color: theme.primary }}>▊</Text>
                    </Text>
                  </ScrollView>
                </View>
              ) : (
                <TextInput
                  multiline
                  textAlignVertical="top"
                  scrollEnabled
                  value={editContent}
                  onChangeText={setEditContent}
                  style={[styles.transcriptTextInput, { color: theme.text }]}
                  placeholder="No transcription yet — generate one below or type directly."
                  placeholderTextColor={theme.secondary}
                  accessibilityLabel="Transcription editor"
                />
              )}
            </View>
          </View>

          {/* Modal Footer */}
          <View style={[styles.transcriptModalFooter, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
            <TouchableOpacity
              onPress={() => selectedSource && handleGenerateTranscription(selectedSource.id)}
              disabled={!!isStreaming}
              style={[
                styles.footerBtn,
                { backgroundColor: theme.tint + '20', opacity: isStreaming ? 0.5 : 1 },
              ]}
              accessibilityLabel="Generate transcription"
              accessibilityRole="button"
            >
              <ScanText size={15} color={theme.tint} />
              <Text style={[styles.footerBtnText, { color: theme.tint }]}>Generate Transcription</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={saveTranscriptAndClose}
              disabled={isSavingTranscript}
              style={[
                styles.footerBtn,
                styles.footerBtnPrimary,
                { backgroundColor: theme.primary, opacity: isSavingTranscript ? 0.6 : 1 },
              ]}
              accessibilityLabel="Save and close editor"
              accessibilityRole="button"
            >
              <Save size={15} color="#fff" />
              <Text style={[styles.footerBtnText, { color: '#fff' }]}>Save & Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Upload Options Modal */}
      <Modal
        transparent
        visible={!!pendingFiles}
        animationType="fade"
        onRequestClose={() => setPendingFiles(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border, width: 520, padding: 0, overflow: 'hidden' }]}>
            {/* Header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <Text style={[styles.modalTitle, { color: theme.text, marginBottom: 0 }]}>
                Upload {pendingFiles?.length ?? 0} file{(pendingFiles?.length ?? 0) !== 1 ? 's' : ''}
              </Text>
            </View>

            {/* File rows */}
            <ScrollView style={{ maxHeight: 360 }}>
              {(pendingFiles ?? []).map((f, i) => {
                const isLast = i === (pendingFiles?.length ?? 0) - 1;
                const mimeType = f.file.mimeType ?? '';
                return (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      borderBottomWidth: isLast ? 0 : 1,
                      borderBottomColor: theme.border,
                      gap: 14,
                    }}
                  >
                    {/* Thumbnail */}
                    <View style={{
                      width: 48, height: 48, borderRadius: 8, overflow: 'hidden',
                      backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border,
                      justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                    }}>
                      {mimeType.startsWith('image/') && f.file.uri ? (
                        <Image source={{ uri: f.file.uri }} style={{ width: 48, height: 48 }} resizeMode="cover" />
                      ) : mimeType.startsWith('audio/') ? (
                        <Mic size={22} color={theme.tint} />
                      ) : mimeType.startsWith('video/') ? (
                        <Film size={22} color={theme.icon} />
                      ) : (
                        <FileText size={22} color={theme.icon} />
                      )}
                    </View>

                    {/* Filename */}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={2} style={{ color: theme.text, fontWeight: '600', fontSize: 13, lineHeight: 18 }}>
                        {f.file.name}
                      </Text>
                      <Text style={{ color: theme.secondary, fontSize: 11, marginTop: 2 }}>
                        {mimeType || 'Unknown type'}
                      </Text>
                    </View>

                    {/* Checkboxes — stacked on right */}
                    <View style={{ gap: 6, alignItems: 'flex-start', flexShrink: 0 }}>
                      {f.isVideo && (
                        <UploadCheckRow
                          label="Convert to audio"
                          checked={f.convertAudio}
                          disabled={false}
                          theme={theme}
                          onChange={v => setPendingFiles(prev => prev!.map((p, j) => j === i ? { ...p, convertAudio: v } : p))}
                        />
                      )}
                      {(!f.isVideo || f.convertAudio) && (
                        <UploadCheckRow
                          label="Transcribe"
                          checked={f.transcribe}
                          disabled={false}
                          theme={theme}
                          onChange={v => setPendingFiles(prev => prev!.map((p, j) =>
                            j === i ? { ...p, transcribe: v, index: v ? p.index : false } : p
                          ))}
                        />
                      )}
                      {(!f.isVideo || f.convertAudio) && (
                        <UploadCheckRow
                          label="Index"
                          checked={f.index}
                          disabled={!f.transcribe}
                          theme={theme}
                          onChange={v => setPendingFiles(prev => prev!.map((p, j) => j === i ? { ...p, index: v } : p))}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Footer */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: theme.border }}>
              <TouchableOpacity
                onPress={() => setPendingFiles(null)}
                style={[styles.modalBtn, { backgroundColor: theme.border }]}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmUpload}
                style={[styles.modalBtn, { backgroundColor: theme.primary }]}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Upload & Process</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Video → Audio Conversion Modal */}
      <Modal
        transparent
        visible={!!convertModalSource}
        animationType="fade"
        onRequestClose={() => setConvertModalSource(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Film size={28} color={theme.icon} style={{ marginBottom: 12, opacity: 0.6 }} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>Convert to Audio?</Text>
            <Text style={[styles.modalText, { color: theme.secondary }]}>
              {convertModalSource?.original_filename}{'\n\n'}
              Video playback isn't supported yet. Extract the audio track so you can transcribe it?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setConvertModalSource(null)}
                style={[styles.modalBtn, { backgroundColor: theme.border }]}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Keep as Video</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConvertToAudio}
                style={[styles.modalBtn, { backgroundColor: theme.tint }]}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Convert to Audio</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bulk Delete Confirmation Modal */}
      <Modal
        transparent
        visible={bulkDeleteConfirmVisible}
        animationType="fade"
        onRequestClose={() => setBulkDeleteConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Delete {selectedIds.size} Sources?</Text>
            <Text style={[styles.modalText, { color: theme.secondary }]}>
              This will permanently delete {selectedIds.size} source{selectedIds.size !== 1 ? 's' : ''}. This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setBulkDeleteConfirmVisible(false)}
                style={[styles.modalBtn, { backgroundColor: theme.border }]}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={runBulkDelete}
                style={[styles.modalBtn, { backgroundColor: theme.error }]}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Delete All</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        transparent
        visible={deleteModalVisible}
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Delete Source?</Text>
            <Text style={[styles.modalText, { color: theme.secondary }]}>
              Are you sure you want to delete this source? This action cannot be undone.
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
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function IndexChips({ icon, label, items, color }: { icon: React.ReactNode; label: string; items?: string[]; color: string }) {
  if (!items || items.length === 0) return null;
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        {icon}
        <Text style={{ fontSize: 10, color, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {items.map((item, i) => (
          <View key={i} style={{ backgroundColor: color + '18', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontSize: 11, color }}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function UploadCheckRow({
  label, checked, disabled, onChange, theme
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  theme: any;
}) {
  return (
    <TouchableOpacity
      onPress={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, opacity: disabled ? 0.4 : 1 }}
      accessibilityRole="checkbox"
    >
      <View style={{
        width: 16, height: 16, borderRadius: 3, borderWidth: 1.5,
        borderColor: checked && !disabled ? theme.primary : theme.border,
        backgroundColor: checked && !disabled ? theme.primary : 'transparent',
        justifyContent: 'center', alignItems: 'center',
      }}>
        {checked && !disabled && <Check size={10} color="#fff" />}
      </View>
      <Text style={{ fontSize: 12, color: theme.text, fontWeight: '500' }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  mainArea: {
    flex: 3,
    padding: 24,
  },
  detailsPane: {
    flex: 1,
    borderLeftWidth: 1,
    padding: 20,
    maxWidth: 400,
    justifyContent: 'space-between',
  },
  paneContentWrapper: {
    flex: 1,
    marginBottom: 20,
  },
  paneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleInput: {
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 6,
    paddingHorizontal: 0,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    outlineStyle: 'none',
  },
  paneFooter: {
    borderTopWidth: 1,
    borderTopColor: 'transparent',
    paddingTop: 20,
  },
  uploadBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    height: 110,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
    gap: 4,
  },
  uploadHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  uploadText: {
    fontSize: 12,
    fontWeight: '400',
  },
  gridContent: {
    paddingBottom: 40,
  },
  card: {
    flex: 1,
    margin: 8,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    height: 200,
    maxWidth: '31%',
    minWidth: 150,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  sidebarHeader: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: Fonts?.heading ?? 'serif',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  transcriptionTools: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  btnText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  transcriptionBox: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
    minHeight: 200,
  },
  deleteBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
    width: '100%',
  },
  cardPreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00000020',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cardFooter: {
    padding: 12,
    borderTopWidth: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  // Transcript editor modal
  transcriptModalRoot: {
    flex: 1,
    flexDirection: 'column',
  },
  transcriptModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  transcriptModalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  transcriptSavedLabel: {
    fontSize: 12,
    fontWeight: '400',
    minWidth: 100,
    textAlign: 'right',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transcriptModalBody: {
    flex: 1,
    flexDirection: 'row',
  },
  transcriptLeftPane: {
    flex: 1,
    borderRightWidth: 1,
  },
  transcriptRightPane: {
    flex: 1,
    padding: 20,
  },
  modalPreviewImage: {
    width: '100%',
    minHeight: 400,
    resizeMode: 'contain',
  },
  transcriptTextInput: {
    flex: 1,
    fontFamily: 'Charter, Georgia, serif',
    fontSize: 15,
    lineHeight: 26,
    textAlignVertical: 'top',
  },
  transcriptEditorText: {
    fontFamily: 'Charter, Georgia, serif',
    fontSize: 15,
    lineHeight: 26,
  },
  transcriptModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  footerBtnPrimary: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  footerBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Delete confirmation modal
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000080',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: 400,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  modalText: {
    fontSize: 16,
    marginBottom: 24,
    lineHeight: 24,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  previewContainer: {
    height: 250,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  centeredMsg: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  indexTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    fontFamily: Fonts?.heading ?? 'serif',
  },
  indexSummary: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  spinner: {
    opacity: 0.8,
  },
  // Multi-select / bulk UI
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  bulkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  cardCheckbox: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
});
