import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, useColorScheme } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { UploadCloud, FileText, Image as ImageIcon, CheckCircle2, Loader2 } from 'lucide-react-native';
import { Colors, Fonts } from '@/constants/theme';
import { uploadFile } from '@/api/client';

export default function SourcePanel({ onSourceSelect }: { onSourceSelect: (source: any) => void }) {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'dark']; // Default to dark if null
    const [items, setItems] = useState<any[]>([]);
    const [uploading, setUploading] = useState(false);

    const handlePickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['image/*', 'application/pdf'],
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            const file = result.assets[0];
            setUploading(true);

            try {
                const uploaded = await uploadFile(file);
                // Mock status logic
                setItems(prev => [{ ...uploaded, status: 'Transcribing' }, ...prev]);

                // Simulate processing for demo
                setTimeout(() => {
                    setItems(prev => prev.map(i => i.id === uploaded.id ? { ...i, status: 'Indexed' } : i));
                }, 2000);
            } catch (e) {
                console.error(e);
                alert('Upload failed: ' + (e as any).message);
            } finally {
                setUploading(false);
            }

        } catch (err) {
            console.log('Error picking document', err);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Text style={[styles.header, { color: theme.text }]}>Sources</Text>

            <TouchableOpacity
                onPress={handlePickDocument}
                style={[styles.uploadZone, { borderColor: theme.border, backgroundColor: theme.card }]}
            >
                <UploadCloud size={24} color={theme.tint} />
                <Text style={[styles.uploadText, { color: theme.secondary }]}>Drop here or click to upload</Text>
            </TouchableOpacity>

            {uploading && <ActivityIndicator size="small" color={theme.tint} style={{ marginVertical: 10 }} />}

            <FlatList
                data={items}
                contentContainerStyle={{ paddingBottom: 20 }}
                keyExtractor={(item) => item.id || Math.random().toString()}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        onPress={() => onSourceSelect(item)}
                        style={[styles.item, { backgroundColor: theme.card, borderColor: theme.border }]}
                    >
                        <StatusIcon status={item.status} color={theme.icon} tint={theme.tint} />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                            <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                                {item.original_filename}
                            </Text>
                            <Text style={[styles.itemStatus, { color: theme.secondary }]}>
                                {item.status}
                            </Text>
                        </View>
                    </TouchableOpacity>
                )}
            />
        </View>
    );
}

function StatusIcon({ status, color, tint }: { status: string, color: string, tint: string }) {
    if (status === 'Transcribing') return <Loader2 size={20} color={tint} />;
    if (status === 'Indexed' || status === 'Ready') return <CheckCircle2 size={20} color={Colors.dark.success} />;
    return <FileText size={20} color={color} />;
}

const styles = StyleSheet.create({
    container: {
        width: 300, // Fixed width sidebar for desktop logic, will be responsive in parent
        padding: 16,
        borderRightWidth: 1,
    },
    header: {
        fontSize: 20,
        fontWeight: '600',
        marginBottom: 20,
        fontFamily: Fonts?.heading ?? 'serif',
    },
    uploadZone: {
        borderWidth: 2,
        borderStyle: 'dashed',
        borderRadius: 12,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
    },
    uploadText: {
        marginTop: 12,
        fontSize: 14,
        textAlign: 'center',
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
    },
    itemTitle: {
        fontWeight: '500',
        fontSize: 14,
    },
    itemStatus: {
        fontSize: 12,
        marginTop: 2,
    }
});
