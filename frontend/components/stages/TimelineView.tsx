import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Pressable,
} from 'react-native';
import {
  X,
  Mic,
  FileText,
  Image as ImageIcon,
  File,
  Tag,
  Users,
  MapPin,
  Calendar,
} from 'lucide-react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useAppColorScheme } from '@/context/JourneyContext';
import { getSources, BASE_URL } from '@/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Source {
  id: string;
  original_filename: string;
  stored_filename?: string;
  title?: string;
  summary?: string;
  keywords?: string[];
  people?: string[];
  locations?: string[];
  timeline?: string[];
  content_type?: string;
  transcription?: string;
  indexed_at?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseYears(timeline: string[] | null | undefined): number[] {
  if (!timeline || timeline.length === 0) return [];
  const years = new Set<number>();
  for (const entry of timeline) {
    const matches = entry.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/g);
    if (matches) matches.forEach(y => years.add(parseInt(y, 10)));
  }
  return Array.from(years);
}

function getTypeColor(contentType: string | undefined, theme: typeof Colors['dark']): string {
  if (!contentType) return theme.secondary;
  if (contentType.startsWith('image/')) return theme.tint;
  if (contentType.startsWith('audio/')) return theme.success;
  if (contentType === 'application/pdf') return theme.warning;
  return theme.secondary;
}

function getTypeLabel(contentType: string | undefined): string {
  if (!contentType) return 'Text';
  if (contentType.startsWith('image/')) return 'Image';
  if (contentType.startsWith('audio/')) return 'Audio';
  if (contentType === 'application/pdf') return 'PDF';
  return 'Text';
}

function TypeIcon({ contentType, color, size }: { contentType?: string; color: string; size: number }) {
  if (contentType?.startsWith('audio/')) return <Mic size={size} color={color} />;
  if (contentType === 'application/pdf') return <FileText size={size} color={color} />;
  if (contentType?.startsWith('image/')) return <ImageIcon size={size} color={color} />;
  return <File size={size} color={color} />;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface IndexChipsProps {
  icon: React.ReactNode;
  label: string;
  items?: string[];
  color: string;
}

function IndexChips({ icon, label, items, color }: IndexChipsProps) {
  if (!items || items.length === 0) return null;
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        {icon}
        <Text style={{ fontSize: 10, color, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Text>
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

// ---------------------------------------------------------------------------
// Source Dot
// ---------------------------------------------------------------------------

interface SourceDotProps {
  source: Source;
  isSelected: boolean;
  onPress: () => void;
  theme: typeof Colors['dark'];
}

function SourceDot({ source, isSelected, onPress, theme }: SourceDotProps) {
  const [isHovered, setIsHovered] = useState(false);
  const borderColor = getTypeColor(source.content_type, theme);
  const iconColor = borderColor;

  const scale = isHovered ? 1.15 : 1;

  return (
    <Pressable
      onPress={onPress}
      // @ts-ignore — web-only hover events
      onMouseEnter={() => Platform.OS === 'web' && setIsHovered(true)}
      // @ts-ignore
      onMouseLeave={() => Platform.OS === 'web' && setIsHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={`Source: ${source.title || source.original_filename}`}
      style={[
        styles.dot,
        {
          borderColor,
          backgroundColor: isSelected ? borderColor + '30' : theme.card,
          transform: [{ scale }],
          // Glow for selected
          ...(isSelected && Platform.OS === 'web' ? {
            // @ts-ignore
            boxShadow: `0 0 0 3px ${borderColor}60`,
          } : {}),
        },
      ]}
    >
      <TypeIcon contentType={source.content_type} color={iconColor} size={16} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------

interface DetailPanelProps {
  source: Source;
  onClose: () => void;
  theme: typeof Colors['dark'];
}

function DetailPanel({ source, onClose, theme }: DetailPanelProps) {
  const typeColor = getTypeColor(source.content_type, theme);
  const typeLabel = getTypeLabel(source.content_type);
  const transcriptionPreview = source.transcription
    ? source.transcription.slice(0, 300) + (source.transcription.length > 300 ? '…' : '')
    : null;

  return (
    <View style={[styles.detailsPane, { backgroundColor: theme.card, borderLeftColor: theme.border }]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        {/* Header */}
        <View style={styles.paneHeader}>
          <Text
            style={[styles.paneTitle, { color: theme.text, fontFamily: Fonts?.heading }]}
            numberOfLines={2}
          >
            {source.title || source.original_filename}
          </Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close detail panel" accessibilityRole="button">
            <X size={20} color={theme.icon} />
          </TouchableOpacity>
        </View>

        {/* Filename (if title is shown above) */}
        {source.title && (
          <Text style={{ color: theme.secondary, fontSize: 11, marginBottom: 12 }} numberOfLines={1}>
            {source.original_filename}
          </Text>
        )}

        {/* Type badge */}
        <View style={{ flexDirection: 'row', marginBottom: 16 }}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + '20', borderColor: typeColor + '40' }]}>
            <TypeIcon contentType={source.content_type} color={typeColor} size={11} />
            <Text style={{ color: typeColor, fontSize: 11, fontWeight: '700', marginLeft: 5 }}>{typeLabel}</Text>
          </View>
        </View>

        {/* Timeline chips */}
        {source.timeline && source.timeline.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <Calendar size={11} color={theme.secondary} />
              <Text style={{ fontSize: 10, color: theme.secondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Timeline
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {source.timeline.map((entry, i) => (
                <View key={i} style={{ backgroundColor: theme.secondary + '18', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, color: theme.secondary }}>{entry}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Summary */}
        {source.summary && (
          <View style={[styles.summaryBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontSize: 13, lineHeight: 20, fontFamily: Fonts?.heading }}>
              {source.summary}
            </Text>
          </View>
        )}

        {/* People / Locations / Keywords */}
        <IndexChips icon={<Users size={11} color={theme.success} />} label="People" items={source.people} color={theme.success} />
        <IndexChips icon={<MapPin size={11} color={theme.primary} />} label="Locations" items={source.locations} color={theme.primary} />
        <IndexChips icon={<Tag size={11} color={theme.tint} />} label="Keywords" items={source.keywords} color={theme.tint} />

        {/* Transcription preview */}
        {transcriptionPreview && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 10, color: theme.secondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Transcription preview
            </Text>
            <View style={[styles.transcriptionPreview, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontSize: 12, lineHeight: 19, fontFamily: Fonts?.heading }}>
                {transcriptionPreview}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main TimelineView
// ---------------------------------------------------------------------------

const AXIS_Y = 220;        // y position of the axis line within the scroll container
const DOT_SIZE = 40;
const DOT_SPACING = 48;    // vertical gap between stacked dots
const CONTAINER_HEIGHT = 440;
const PX_PER_YEAR = 90;
const MIN_TIMELINE_WIDTH = 1000;

export default function TimelineView() {
  const colorScheme = useAppColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];

  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getSources();
        const mapped: Source[] = data.map((s: any) => ({ ...s }));
        setSources(mapped);
      } catch (e) {
        setError('Failed to load sources. Is the backend running?');
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Only show indexed sources on the timeline
  const indexedSources = useMemo(() => sources.filter(s => !!s.indexed_at), [sources]);

  // Build yearMap and undated list
  const { yearMap, undated } = useMemo(() => {
    const map = new Map<number, Source[]>();
    const ud: Source[] = [];
    for (const source of indexedSources) {
      const years = parseYears(source.timeline);
      if (years.length === 0) {
        ud.push(source);
      } else {
        for (const year of years) {
          if (!map.has(year)) map.set(year, []);
          map.get(year)!.push(source);
        }
      }
    }
    return { yearMap: map, undated: ud };
  }, [indexedSources]);

  const sortedYears = useMemo(() => Array.from(yearMap.keys()).sort((a, b) => a - b), [yearMap]);

  const minYear = sortedYears[0] ?? 1900;
  const maxYear = sortedYears[sortedYears.length - 1] ?? 2000;
  const yearSpan = Math.max(1, maxYear - minYear);
  const timelineWidth = Math.max(MIN_TIMELINE_WIDTH, yearSpan * PX_PER_YEAR + 120);

  function xForYear(year: number): number {
    return 60 + ((year - minYear) / yearSpan) * (timelineWidth - 120);
  }

  // Decade markers
  const firstDecade = Math.ceil(minYear / 10) * 10;
  const decades: number[] = [];
  for (let d = firstDecade; d <= maxYear; d += 10) {
    decades.push(d);
  }

  // Gap detection: spans of 5+ years with no sources
  const gaps: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < sortedYears.length - 1; i++) {
    const gap = sortedYears[i + 1] - sortedYears[i];
    if (gap >= 5) {
      gaps.push({ start: sortedYears[i], end: sortedYears[i + 1] });
    }
  }

  const hasAnyTimeline = sortedYears.length > 0;
  const totalSourcesWithDate = indexedSources.length - undated.length;

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------
  if (!isLoading && indexedSources.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: Fonts?.heading }]}>
            No timeline data yet.
          </Text>
          <Text style={[styles.emptyBody, { color: theme.secondary, fontFamily: Fonts?.body }]}>
            Transcribe and index your sources first — Journey will extract dates automatically.
          </Text>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Loading / error
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.emptyState}>
          <Text style={{ color: theme.secondary, fontFamily: Fonts?.body }}>Loading sources…</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.emptyState}>
          <Text style={{ color: theme.error, fontFamily: Fonts?.body }}>{error}</Text>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.headerTitle, { color: theme.text, fontFamily: Fonts?.heading }]}>
          Story Map
        </Text>
        <View style={styles.headerStats}>
          <View style={styles.statChip}>
            <View style={[styles.statDot, { backgroundColor: theme.tint }]} />
            <Text style={[styles.statText, { color: theme.secondary, fontFamily: Fonts?.body }]}>
              {totalSourcesWithDate} dated
            </Text>
          </View>
          {undated.length > 0 && (
            <View style={styles.statChip}>
              <View style={[styles.statDot, { backgroundColor: theme.border }]} />
              <Text style={[styles.statText, { color: theme.secondary, fontFamily: Fonts?.body }]}>
                {undated.length} undated
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Body: timeline + optional detail pane ── */}
      <View style={styles.body}>
        {/* Main timeline area */}
        <View style={styles.mainArea}>
          {hasAnyTimeline ? (
            <>
              {/* Horizontal scrollable timeline */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                style={styles.timelineScroll}
                contentContainerStyle={{ width: timelineWidth + 80, paddingRight: 40 }}
              >
                <View style={[styles.timelineContainer, { height: CONTAINER_HEIGHT }]}>

                  {/* ── Gap indicators ── */}
                  {gaps.map((gap, i) => {
                    const x1 = xForYear(gap.start) + DOT_SIZE / 2;
                    const x2 = xForYear(gap.end) - DOT_SIZE / 2;
                    const midX = (x1 + x2) / 2;
                    const width = x2 - x1;
                    if (width < 20) return null;
                    return (
                      <View key={i} style={{ position: 'absolute', left: x1, top: AXIS_Y - 1, width, height: 2 }}>
                        {/* Dashed line — implemented as repeating segments for RN compatibility */}
                        <View style={{
                          width: '100%',
                          height: 1,
                          backgroundColor: theme.border,
                          // @ts-ignore - web-only
                          ...(Platform.OS === 'web' ? { borderTop: `1px dashed ${theme.border}`, backgroundColor: 'transparent' } : {}),
                        }} />
                        <Text style={[styles.gapLabel, { color: theme.secondary, left: (width / 2) - 15, fontFamily: Fonts?.body }]}>
                          gap
                        </Text>
                      </View>
                    );
                  })}

                  {/* ── Axis line ── */}
                  <View style={[styles.axisLine, { top: AXIS_Y, backgroundColor: theme.border, width: timelineWidth }]} />

                  {/* ── Decade tick marks & labels ── */}
                  {decades.map(decade => {
                    const x = xForYear(decade);
                    return (
                      <View key={decade}>
                        {/* Tall tick */}
                        <View style={{
                          position: 'absolute',
                          left: x - 0.5,
                          top: AXIS_Y - 14,
                          width: 1,
                          height: 28,
                          backgroundColor: theme.secondary + '60',
                        }} />
                        {/* Decade label */}
                        <Text style={[styles.decadeLabel, { left: x, top: AXIS_Y + 18, color: theme.text, fontFamily: Fonts?.body }]}>
                          {decade}
                        </Text>
                      </View>
                    );
                  })}

                  {/* ── Year tick marks (only for years with sources) ── */}
                  {sortedYears.filter(y => y % 10 !== 0).map(year => {
                    const x = xForYear(year);
                    return (
                      <View key={year}>
                        {/* Short tick */}
                        <View style={{
                          position: 'absolute',
                          left: x - 0.5,
                          top: AXIS_Y - 6,
                          width: 1,
                          height: 12,
                          backgroundColor: theme.border,
                        }} />
                        {/* Year label */}
                        <Text style={[styles.yearLabel, { left: x, top: AXIS_Y + 18, color: theme.secondary, fontFamily: Fonts?.body }]}>
                          {year}
                        </Text>
                      </View>
                    );
                  })}

                  {/* ── Source dots stacked above axis ── */}
                  {sortedYears.map(year => {
                    const sourcesAtYear = yearMap.get(year) ?? [];
                    return sourcesAtYear.map((source, stackIndex) => {
                      const x = xForYear(year) - DOT_SIZE / 2;
                      const y = AXIS_Y - DOT_SIZE - 8 - stackIndex * DOT_SPACING;
                      return (
                        <View
                          key={`${year}-${source.id}`}
                          style={{ position: 'absolute', left: x, top: y }}
                        >
                          <SourceDot
                            source={source}
                            isSelected={selectedSource?.id === source.id}
                            onPress={() => setSelectedSource(prev => prev?.id === source.id ? null : source)}
                            theme={theme}
                          />
                        </View>
                      );
                    });
                  })}

                </View>
              </ScrollView>

              {/* ── Undated section ── */}
              {undated.length > 0 && (
                <View style={[styles.undatedSection, { borderTopColor: theme.border }]}>
                  <Text style={[styles.undatedLabel, { color: theme.secondary, fontFamily: Fonts?.body }]}>
                    Undated Sources ({undated.length})
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                    {undated.map(source => {
                      const typeColor = getTypeColor(source.content_type, theme);
                      const isSelected = selectedSource?.id === source.id;
                      return (
                        <TouchableOpacity
                          key={source.id}
                          onPress={() => setSelectedSource(prev => prev?.id === source.id ? null : source)}
                          accessibilityRole="button"
                          accessibilityLabel={`Undated source: ${source.title || source.original_filename}`}
                          style={[
                            styles.undatedCard,
                            {
                              backgroundColor: isSelected ? typeColor + '18' : theme.card,
                              borderColor: isSelected ? typeColor : theme.border,
                            },
                          ]}
                        >
                          <TypeIcon contentType={source.content_type} color={typeColor} size={14} />
                          <Text style={{ color: theme.secondary, fontSize: 11, marginLeft: 6, maxWidth: 120 }} numberOfLines={1}>
                            {source.title || source.original_filename}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: Fonts?.heading }]}>
                No timeline data yet.
              </Text>
              <Text style={[styles.emptyBody, { color: theme.secondary, fontFamily: Fonts?.body }]}>
                Transcribe and index your sources first — Journey will extract dates automatically.
              </Text>
            </View>
          )}
        </View>

        {/* ── Detail pane ── */}
        {selectedSource && (
          <DetailPanel
            source={selectedSource}
            onClose={() => setSelectedSource(null)}
            theme={theme}
          />
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerStats: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statText: {
    fontSize: 13,
    fontWeight: '500',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  mainArea: {
    flex: 3,
    flexDirection: 'column',
  },
  timelineScroll: {
    flex: 1,
  },
  timelineContainer: {
    position: 'relative',
  },
  axisLine: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
  },
  decadeLabel: {
    position: 'absolute',
    fontSize: 13,
    fontWeight: '700',
    transform: [{ translateX: -18 }],
  },
  yearLabel: {
    position: 'absolute',
    fontSize: 10,
    fontWeight: '500',
    transform: [{ translateX: -12 }],
  },
  gapLabel: {
    position: 'absolute',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    top: 6,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    // @ts-ignore - web transition
    ...(Platform.OS === 'web' ? { transition: 'transform 120ms ease, box-shadow 120ms ease' } : {}),
  },
  undatedSection: {
    borderTopWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  undatedLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  undatedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  detailsPane: {
    maxWidth: 380,
    flex: 1,
    borderLeftWidth: 1,
  },
  paneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 12,
  },
  paneTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    lineHeight: 24,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  summaryBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 4,
    marginTop: 4,
  },
  transcriptionPreview: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 420,
  },
});
