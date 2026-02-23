import React from 'react';
import { View, Text } from 'react-native';
import { Mic } from 'lucide-react-native';
import { Colors } from '@/constants/theme';
import { useAppColorScheme } from '@/context/JourneyContext';

interface Props {
    src: string;
}

export default function AudioPlayer({ src }: Props) {
    const colorScheme = useAppColorScheme();
    const theme = Colors[colorScheme ?? 'dark'];
    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <Mic size={32} color={theme.secondary} />
            <Text style={{ color: theme.secondary, fontSize: 13 }}>Audio playback not supported on native.</Text>
        </View>
    );
}
