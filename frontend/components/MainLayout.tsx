import React, { useState, useRef } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Animated } from 'react-native';
import { Colors } from '@/constants/theme';
import StageSwitcher from './StageSwitcher';
import VaultView from './stages/VaultView';
import ForgeView from './stages/ForgeView';
import ManuscriptView from './stages/ManuscriptView';
import ChatView from './stages/ChatView';
import SourceExplorerView from './stages/SourceExplorerView';
import SettingsView from './stages/SettingsView';
import { useJourney, useAppColorScheme } from '@/context/JourneyContext';
import { MessageSquare, Search } from 'lucide-react-native';

type ActivePopup = 'chat' | 'sources' | null;

export default function MainLayout() {
    const colorScheme = useAppColorScheme();
    const theme = Colors[colorScheme ?? 'dark'];
    const { stage } = useJourney();

    const [modalVisible, setModalVisible] = useState(false);
    const [activePopup, setActivePopup] = useState<ActivePopup>(null);
    // Tracks which popup is actually mounted so we can keep it alive during the close animation.
    const [mountedPopup, setMountedPopup] = useState<ActivePopup>(null);
    const popupAnim = useRef(new Animated.Value(0)).current;

    const openPopup = (target: 'chat' | 'sources') => {
        // If the same popup is already open, close it.
        if (activePopup === target) {
            closePopup();
            return;
        }

        // If a different popup is open, close it instantly then open the new one.
        if (activePopup !== null) {
            popupAnim.stopAnimation((_value: number) => {
                popupAnim.setValue(0);
                setActivePopup(target);
                setMountedPopup(target);
                Animated.spring(popupAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    tension: 180,
                    friction: 12,
                }).start();
            });
            return;
        }

        setMountedPopup(target);
        setActivePopup(target);
        popupAnim.setValue(0);
        Animated.spring(popupAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 180,
            friction: 12,
        }).start();
    };

    const closePopup = () => {
        setActivePopup(null);
        Animated.timing(popupAnim, {
            toValue: 0,
            duration: 160,
            useNativeDriver: true,
        }).start(() => setMountedPopup(null));
    };

    const animatedStyle = {
        opacity: popupAnim,
        transform: [
            {
                scale: popupAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.82, 1],
                }),
            },
            {
                translateY: popupAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                }),
            },
        ],
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Global Stage Switcher - Overlay */}
            <View style={styles.switcherWrapper}>
                <StageSwitcher />
            </View>

            {/* Dynamic Stage Content */}
            <View style={styles.content}>
                {stage === 'VAULT' && <VaultView />}
                {stage === 'FORGE' && <ForgeView />}
                {stage === 'MANUSCRIPT' && <ManuscriptView />}
                {stage === 'SETTINGS' && <SettingsView />}
            </View>

            {/* Floating popup window */}
            {mountedPopup !== null && (
                <View style={styles.popupAnchor} pointerEvents="box-none">
                    <Animated.View style={[
                        styles.popupWindow,
                        { backgroundColor: theme.card, borderColor: theme.border },
                        animatedStyle,
                    ]}>
                        {mountedPopup === 'chat' && <ChatView onClose={closePopup} />}
                        {mountedPopup === 'sources' && <SourceExplorerView onClose={closePopup} />}
                    </Animated.View>
                </View>
            )}

            {/* Floating Action Buttons */}
            <View style={styles.fabAnchor} pointerEvents="box-none">
                {/* Source Explorer FAB */}
                <TouchableOpacity
                    onPress={() => openPopup('sources')}
                    style={[
                        styles.fab,
                        {
                            backgroundColor: activePopup === 'sources' ? theme.tint : theme.card,
                            borderColor: activePopup === 'sources' ? theme.tint : theme.border,
                        },
                    ]}
                    accessibilityLabel="Search sources"
                    accessibilityRole="button"
                >
                    <Search
                        size={22}
                        color={activePopup === 'sources' ? '#fff' : theme.tint}
                    />
                </TouchableOpacity>

                {/* Chat FAB */}
                <TouchableOpacity
                    onPress={() => openPopup('chat')}
                    style={[
                        styles.fab,
                        {
                            backgroundColor: activePopup === 'chat' ? theme.tint : theme.card,
                            borderColor: activePopup === 'chat' ? theme.tint : theme.border,
                        },
                    ]}
                    accessibilityLabel="Ask Archive"
                    accessibilityRole="button"
                >
                    <MessageSquare
                        size={22}
                        color={activePopup === 'chat' ? '#fff' : theme.tint}
                    />
                </TouchableOpacity>
            </View>

            {/* Global Modal */}
            <Modal visible={modalVisible} animationType="fade" transparent onRequestClose={() => setModalVisible(false)}>
                {/* ... */}
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        position: 'relative',
    },
    switcherWrapper: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
    },
    content: {
        flex: 1,
        marginLeft: 70,
    },
    fabAnchor: {
        position: 'absolute',
        bottom: 24,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        zIndex: 200,
    },
    fab: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
        elevation: 8,
    },
    popupAnchor: {
        position: 'absolute',
        bottom: 24,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 200,
    },
    popupWindow: {
        width: 480,
        height: 520,
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
        elevation: 12,
    },
});
