import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react-native';
import { Colors } from '@/constants/theme';
import { useAppColorScheme } from '@/context/JourneyContext';

interface Props {
    src: string;
}

function fmt(s: number) {
    if (!isFinite(s) || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({ src }: Props) {
    const colorScheme = useAppColorScheme();
    const theme = Colors[colorScheme ?? 'dark'];

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const seekingRef = useRef(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [muted, setMuted] = useState(false);

    // Inject scoped CSS for the range input
    useEffect(() => {
        const id = 'journey-audio-player-styles';
        const existing = document.getElementById(id);
        if (existing) existing.remove();

        const style = document.createElement('style');
        style.id = id;
        style.textContent = `
            .journey-scrubber {
                -webkit-appearance: none;
                appearance: none;
                width: 100%;
                height: 4px;
                border-radius: 2px;
                background: ${theme.border};
                outline: none;
                cursor: pointer;
            }
            .journey-scrubber::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: ${theme.primary};
                cursor: pointer;
                box-shadow: 0 0 0 3px ${theme.primary}30;
                transition: box-shadow 0.15s;
            }
            .journey-scrubber::-webkit-slider-thumb:hover {
                box-shadow: 0 0 0 5px ${theme.primary}40;
            }
            .journey-scrubber::-moz-range-thumb {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: ${theme.primary};
                cursor: pointer;
                border: none;
            }
            .journey-scrubber::-webkit-slider-runnable-track {
                border-radius: 2px;
            }
        `;
        document.head.appendChild(style);
    }, [theme.primary, theme.border]);

    useEffect(() => {
        const audio = new (window as any).Audio(src) as HTMLAudioElement;
        audioRef.current = audio;

        const onTime = () => {
            if (!seekingRef.current) setCurrentTime(audio.currentTime);
        };
        const onMeta = () => setDuration(audio.duration);
        const onEnd = () => setIsPlaying(false);

        audio.addEventListener('timeupdate', onTime);
        audio.addEventListener('loadedmetadata', onMeta);
        audio.addEventListener('ended', onEnd);

        return () => {
            audio.removeEventListener('timeupdate', onTime);
            audio.removeEventListener('loadedmetadata', onMeta);
            audio.removeEventListener('ended', onEnd);
            audio.pause();
            audio.src = '';
        };
    }, [src]);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            audio.play();
            setIsPlaying(true);
        }
    }, [isPlaying]);

    const toggleMute = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.muted = !muted;
        setMuted(m => !m);
    }, [muted]);

    const handleScrubStart = useCallback(() => {
        seekingRef.current = true;
    }, []);

    const handleScrub = useCallback((e: any) => {
        const val = parseFloat(e.target.value);
        setCurrentTime(val);
    }, []);

    const handleScrubEnd = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = currentTime;
        seekingRef.current = false;
    }, [currentTime]);

    // Build a gradient background for the filled-track illusion
    const fillPct = duration > 0 ? (currentTime / duration) * 100 : 0;
    const trackStyle = {
        background: `linear-gradient(to right, ${theme.primary} ${fillPct}%, ${theme.border} ${fillPct}%)`,
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {/* Waveform bars (decorative) */}
            <View style={styles.waveform}>
                {Array.from({ length: 28 }).map((_, i) => {
                    const h = 6 + Math.abs(Math.sin(i * 0.9 + 1.2) * 18);
                    const filled = fillPct / 100 > i / 28;
                    return (
                        <View
                            key={i}
                            style={[
                                styles.bar,
                                {
                                    height: h,
                                    backgroundColor: filled ? theme.primary : theme.border,
                                    opacity: filled ? 1 : 0.5,
                                },
                            ]}
                        />
                    );
                })}
            </View>

            {/* Controls row */}
            <View style={styles.controls}>
                {/* Play / Pause */}
                <TouchableOpacity
                    onPress={togglePlay}
                    style={[styles.playBtn, { backgroundColor: theme.primary }]}
                >
                    {isPlaying
                        ? <Pause size={18} color="#fff" fill="#fff" />
                        : <Play size={18} color="#fff" fill="#fff" />
                    }
                </TouchableOpacity>

                {/* Scrubber + times */}
                <View style={styles.scrubberArea}>
                    <View style={styles.timeRow}>
                        <Text style={[styles.timeText, { color: theme.secondary }]}>{fmt(currentTime)}</Text>
                        <Text style={[styles.timeText, { color: theme.secondary }]}>{fmt(duration)}</Text>
                    </View>
                    {/* @ts-ignore — HTML input, valid in web context */}
                    <input
                        type="range"
                        className="journey-scrubber"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={currentTime}
                        onInput={handleScrub}
                        onMouseDown={handleScrubStart}
                        onMouseUp={handleScrubEnd}
                        onTouchStart={handleScrubStart}
                        onTouchEnd={handleScrubEnd}
                        style={trackStyle}
                    />
                </View>

                {/* Mute */}
                <TouchableOpacity onPress={toggleMute} style={styles.muteBtn}>
                    {muted
                        ? <VolumeX size={16} color={theme.secondary} />
                        : <Volume2 size={16} color={theme.secondary} />
                    }
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        justifyContent: 'center',
        gap: 14,
        borderRadius: 0,
    },
    waveform: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        height: 36,
    },
    bar: {
        width: 3,
        borderRadius: 2,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    playBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrubberArea: {
        flex: 1,
        gap: 4,
    },
    timeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    timeText: {
        fontSize: 11,
        fontVariant: ['tabular-nums'],
        fontFamily: 'monospace',
    },
    muteBtn: {
        padding: 4,
    },
});
