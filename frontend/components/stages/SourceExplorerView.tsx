import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { Search, X, MapPin, Users, Tag, ArrowLeft } from 'lucide-react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useAppColorScheme } from '@/context/JourneyContext';
import { searchSources, SourceSearchResult } from '@/api/client';

interface SourceExplorerViewProps {
    onClose?: () => void;
}

export default function SourceExplorerView({ onClose }: SourceExplorerViewProps) {
    const colorScheme = useAppColorScheme();
    const theme = Colors[colorScheme ?? 'dark'];

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SourceSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [detailSource, setDetailSource] = useState<SourceSearchResult | null>(null);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounced live search
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        const trimmed = query.trim();

        if (trimmed.length < 2) {
            setResults([]);
            setHasSearched(false);
            setError(null);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setIsLoading(true);
            setError(null);
            setHasSearched(true);

            try {
                const data = await searchSources(trimmed);
                setResults(data);
            } catch {
                setError('Search failed. Is the backend running?');
                setResults([]);
            } finally {
                setIsLoading(false);
            }
        }, 350);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query]);

    const handleClear = () => {
        setQuery('');
        setDetailSource(null);
    };

    // Detail view
    if (detailSource) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                {/* Detail header */}
                <View style={[styles.header, { borderBottomColor: theme.border }]}>
                    <TouchableOpacity
                        onPress={() => setDetailSource(null)}
                        style={styles.backButton}
                        accessibilityLabel="Back to results"
                        accessibilityRole="button"
                    >
                        <ArrowLeft size={18} color={theme.tint} />
                    </TouchableOpacity>
                    <Text
                        style={[styles.headerTitle, { color: theme.text, fontFamily: Fonts?.heading }]}
                        numberOfLines={1}
                    >
                        {detailSource.title || 'Untitled Source'}
                    </Text>
                    {onClose && (
                        <TouchableOpacity
                            onPress={onClose}
                            style={{ marginLeft: 'auto' }}
                            accessibilityLabel="Close source explorer"
                            accessibilityRole="button"
                        >
                            <X size={18} color={theme.icon} />
                        </TouchableOpacity>
                    )}
                </View>

                <ScrollView
                    style={styles.resultList}
                    contentContainerStyle={styles.detailContent}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Summary */}
                    {detailSource.summary ? (
                        <Text style={[styles.detailSummary, { color: theme.secondary, fontFamily: Fonts?.body }]}>
                            {detailSource.summary}
                        </Text>
                    ) : null}

                    {/* Transcription block */}
                    <View style={[styles.transcriptionBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.transcriptionLabel, { color: theme.icon, fontFamily: Fonts?.body }]}>
                            Full Transcription
                        </Text>
                        {detailSource.transcription ? (
                            <Text style={[styles.transcriptionText, { color: theme.text }]}>
                                {detailSource.transcription}
                            </Text>
                        ) : (
                            <Text style={[styles.transcriptionEmpty, { color: theme.secondary, fontFamily: Fonts?.body }]}>
                                No transcription available — transcribe this source in the Vault.
                            </Text>
                        )}
                    </View>

                    {/* Chips */}
                    {((detailSource.keywords?.length ?? 0) > 0 ||
                        (detailSource.people?.length ?? 0) > 0 ||
                        (detailSource.locations?.length ?? 0) > 0) && (
                        <View style={styles.chipsBlock}>
                            <ChipRow
                                icon={<Tag size={11} color={theme.tint} />}
                                items={detailSource.keywords}
                                color={theme.tint}
                                theme={theme}
                            />
                            <ChipRow
                                icon={<Users size={11} color={theme.success} />}
                                items={detailSource.people}
                                color={theme.success}
                                theme={theme}
                            />
                            <ChipRow
                                icon={<MapPin size={11} color={theme.warning} />}
                                items={detailSource.locations}
                                color={theme.warning}
                                theme={theme}
                            />
                        </View>
                    )}
                </ScrollView>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <Search size={18} color={theme.tint} />
                <Text style={[styles.headerTitle, { color: theme.text, fontFamily: Fonts?.heading }]}>
                    Source Explorer
                </Text>
                {onClose && (
                    <TouchableOpacity
                        onPress={onClose}
                        style={{ marginLeft: 'auto' }}
                        accessibilityLabel="Close source explorer"
                        accessibilityRole="button"
                    >
                        <X size={18} color={theme.icon} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Search bar */}
            <View style={[styles.searchArea, { borderBottomColor: theme.border }]}>
                <TextInput
                    style={[
                        styles.searchInput,
                        {
                            backgroundColor: theme.card,
                            borderColor: theme.border,
                            color: theme.text,
                            fontFamily: Fonts?.body,
                        },
                    ]}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search your archive..."
                    placeholderTextColor={theme.icon}
                    returnKeyType="search"
                    accessibilityLabel="Source search input"
                />
                {/* Loading spinner or clear button — no longer a submit button */}
                <View
                    style={[
                        styles.searchButton,
                        {
                            backgroundColor: isLoading
                                ? theme.tint
                                : query.length > 0
                                    ? theme.card
                                    : 'transparent',
                            borderWidth: !isLoading && query.length > 0 ? 1 : 0,
                            borderColor: theme.border,
                        },
                    ]}
                >
                    {isLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : query.length > 0 ? (
                        <TouchableOpacity
                            onPress={handleClear}
                            accessibilityLabel="Clear search"
                            accessibilityRole="button"
                        >
                            <X size={16} color={theme.icon} />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {/* Results */}
            <ScrollView
                style={styles.resultList}
                contentContainerStyle={styles.resultListContent}
                keyboardShouldPersistTaps="handled"
            >
                {!hasSearched && (
                    <View style={styles.emptyState}>
                        <Search size={32} color={theme.icon} style={{ marginBottom: 12 }} />
                        <Text style={[styles.emptyText, { color: theme.secondary, fontFamily: Fonts?.body }]}>
                            Search your archive by topic, name, place, or anything you remember.
                        </Text>
                    </View>
                )}

                {hasSearched && !isLoading && results.length === 0 && !error && (
                    <View style={styles.emptyState}>
                        <Text style={[styles.emptyText, { color: theme.secondary, fontFamily: Fonts?.body }]}>
                            No matching sources found.
                        </Text>
                    </View>
                )}

                {error && (
                    <View style={styles.emptyState}>
                        <Text style={[styles.emptyText, { color: theme.error, fontFamily: Fonts?.body }]}>
                            {error}
                        </Text>
                    </View>
                )}

                {results.map(result => (
                    <ResultCard
                        key={result.id}
                        result={result}
                        theme={theme}
                        onOpen={setDetailSource}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

// ---------- Sub-components ----------

interface ResultCardProps {
    result: SourceSearchResult;
    theme: (typeof Colors)['dark'];
    onOpen: (source: SourceSearchResult) => void;
}

function ResultCard({ result, theme, onOpen }: ResultCardProps) {
    const hasChips =
        (result.keywords?.length ?? 0) > 0 ||
        (result.people?.length ?? 0) > 0 ||
        (result.locations?.length ?? 0) > 0;

    return (
        <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => onOpen(result)}
            accessibilityLabel={`Open source: ${result.title || 'Untitled'}`}
            accessibilityRole="button"
            activeOpacity={0.75}
        >
            <View style={styles.cardHeader}>
                <Text
                    style={[styles.cardTitle, { color: theme.text, fontFamily: Fonts?.heading }]}
                    numberOfLines={1}
                >
                    {result.title || 'Untitled Source'}
                </Text>
            </View>

            {result.summary ? (
                <View style={styles.cardBody}>
                    <Text
                        style={[styles.summaryText, { color: theme.secondary, fontFamily: Fonts?.body }]}
                        numberOfLines={2}
                    >
                        {result.summary}
                    </Text>

                    {hasChips && (
                        <View style={styles.chipsBlock}>
                            <ChipRow
                                icon={<Tag size={11} color={theme.tint} />}
                                items={result.keywords}
                                color={theme.tint}
                                theme={theme}
                            />
                            <ChipRow
                                icon={<Users size={11} color={theme.success} />}
                                items={result.people}
                                color={theme.success}
                                theme={theme}
                            />
                            <ChipRow
                                icon={<MapPin size={11} color={theme.warning} />}
                                items={result.locations}
                                color={theme.warning}
                                theme={theme}
                            />
                        </View>
                    )}
                </View>
            ) : null}
        </TouchableOpacity>
    );
}

interface ChipRowProps {
    icon: React.ReactNode;
    items: string[];
    color: string;
    theme: (typeof Colors)['dark'];
}

function ChipRow({ icon, items, color, theme }: ChipRowProps) {
    if (!items || items.length === 0) return null;

    return (
        <View style={styles.chipRow}>
            {icon}
            <View style={styles.chipList}>
                {items.map((item, i) => (
                    <View
                        key={i}
                        style={[styles.chip, { backgroundColor: color + '18', borderColor: color + '30' }]}
                    >
                        <Text style={[styles.chipText, { color, fontFamily: Fonts?.body }]} numberOfLines={1}>
                            {item}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

// ---------- Styles ----------

// Charter/Georgia serif stack for transcription reading comfort
const SERIF_FONT = Platform.select({
    web: "Charter, 'Bitstream Charter', Georgia, serif",
    ios: 'Georgia',
    default: 'serif',
});

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
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    backButton: {
        marginRight: 4,
    },
    searchArea: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 16,
        borderBottomWidth: 1,
    },
    searchInput: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 14,
        lineHeight: 20,
        // @ts-ignore — web-only
        outlineStyle: 'none',
    },
    searchButton: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    resultList: {
        flex: 1,
    },
    resultListContent: {
        padding: 16,
        gap: 10,
        flexGrow: 1,
    },
    detailContent: {
        padding: 20,
        gap: 16,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
        paddingHorizontal: 40,
    },
    emptyText: {
        fontSize: 14,
        lineHeight: 22,
        textAlign: 'center',
    },
    card: {
        borderRadius: 10,
        borderWidth: 1,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 8,
    },
    cardTitle: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: 0.2,
    },
    cardBody: {
        paddingHorizontal: 14,
        paddingBottom: 14,
        gap: 10,
    },
    summaryText: {
        fontSize: 13,
        lineHeight: 20,
    },
    chipsBlock: {
        gap: 6,
    },
    chipRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        paddingTop: 2,
    },
    chipList: {
        flex: 1,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 5,
    },
    chip: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 5,
        borderWidth: 1,
    },
    chipText: {
        fontSize: 11,
        fontWeight: '500',
        letterSpacing: 0.1,
    },
    // Detail view styles
    detailSummary: {
        fontSize: 14,
        lineHeight: 22,
    },
    transcriptionBlock: {
        borderRadius: 10,
        borderWidth: 1,
        padding: 16,
        gap: 10,
    },
    transcriptionLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    transcriptionText: {
        fontFamily: SERIF_FONT,
        fontSize: 14,
        lineHeight: 24, // 1.7 × 14
    },
    transcriptionEmpty: {
        fontSize: 13,
        lineHeight: 20,
        fontStyle: 'italic',
    },
});
