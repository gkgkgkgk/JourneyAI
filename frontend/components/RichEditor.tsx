import React from 'react';
import { TextInput } from 'react-native';
import { useAppColorScheme } from '@/context/JourneyContext';
import { Colors, Fonts } from '@/constants/theme';

interface Props {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

// Native fallback — plain TextInput. Tiptap doesn't run on native.
export default function RichEditor({ value, onChange, placeholder }: Props) {
    const colorScheme = useAppColorScheme();
    const theme = Colors[colorScheme ?? 'dark'];

    return (
        <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={placeholder ?? 'Start writing…'}
            placeholderTextColor={theme.icon}
            multiline
            textAlignVertical="top"
            style={{
                flex: 1,
                color: theme.text,
                fontFamily: Fonts?.heading ?? 'serif',
                fontSize: 16,
                lineHeight: 28,
                padding: 24,
            }}
        />
    );
}
