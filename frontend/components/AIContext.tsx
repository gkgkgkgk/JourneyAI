import React from 'react';
import { View, Text, StyleSheet, ScrollView, useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';

export default function AIContext() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'dark'];

    return (
        <View style={[styles.container, { backgroundColor: theme.card, borderLeftColor: theme.border }]}>
            <Text style={[styles.header, { color: theme.text }]}>AI Assistant</Text>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={[styles.suggestionBox, { color: theme.secondary }]}>
                    <Text style={{ color: theme.secondary, textAlign: 'center' }}>AI insights and suggestions will appear here.</Text>
                </View>
            </ScrollView>

            {/* Input area for AI Context */}
            <View style={[styles.inputArea, { borderColor: theme.border }]}>
                <Text style={{ color: theme.icon, fontSize: 12 }}>Ask about your story...</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 250, // Fixed width right sidebar
        borderLeftWidth: 1,
        flexDirection: 'column',
    },
    header: {
        padding: 16,
        borderBottomWidth: 1,
        borderColor: '#eee', // Will be dynamic overridden
        fontSize: 16,
        fontWeight: 'bold',
    },
    content: {
        padding: 16,
        flex: 1,
    },
    suggestionBox: {
        padding: 24,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'transparent', // Placeholder styling
        alignItems: 'center',
        marginTop: 20
    },
    inputArea: {
        padding: 16,
        borderTopWidth: 1,
        height: 60,
        justifyContent: 'center',
    }
});
