import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, Text } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';
import { Archive, Hammer, Book, Settings, BookOpen } from 'lucide-react-native';
import { useJourney, useAppColorScheme } from "@/context/JourneyContext";

export default function StageSwitcher() {
    const colorScheme = useAppColorScheme();
    const theme = Colors[colorScheme ?? 'dark'];
    const { stage, setStage } = useJourney();
    const [isHovered, setIsHovered] = useState(false);

    // Web-specific hover handling
    const handleMouseEnter = () => Platform.OS === 'web' && setIsHovered(true);
    const handleMouseLeave = () => Platform.OS === 'web' && setIsHovered(false);

    const containerWidth = isHovered ? 200 : 70; // Expanded width

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.card,
                    borderRightColor: theme.border,
                    width: containerWidth
                }
            ]}
            // @ts-ignore - 'onMouseEnter' is web specific
            onMouseEnter={handleMouseEnter}
            // @ts-ignore
            onMouseLeave={handleMouseLeave}
        >
            {/* Logo / Brand Mark */}
            <View style={[styles.logoSection, { borderBottomColor: theme.border }]}>
                <BookOpen size={20} color={theme.tint} />
                {isHovered && (
                    <Text style={[styles.logoText, { color: theme.text, fontFamily: Fonts?.heading ?? 'serif' }]}>
                        Journey
                    </Text>
                )}
            </View>

            <View style={styles.topSection}>
                <NavItem
                    icon={<Archive size={20} color={stage === 'VAULT' ? theme.tint : theme.icon} />}
                    label="The Vault"
                    active={stage === 'VAULT'}
                    expanded={isHovered}
                    onPress={() => setStage('VAULT')}
                    theme={theme}
                />

                <NavItem
                    icon={<Hammer size={20} color={stage === 'FORGE' ? theme.tint : theme.icon} />}
                    label="The Forge"
                    active={stage === 'FORGE'}
                    expanded={isHovered}
                    onPress={() => setStage('FORGE')}
                    theme={theme}
                />

                <NavItem
                    icon={<Book size={20} color={stage === 'MANUSCRIPT' ? theme.tint : theme.icon} />}
                    label="Manuscript"
                    active={stage === 'MANUSCRIPT'}
                    expanded={isHovered}
                    onPress={() => setStage('MANUSCRIPT')}
                    theme={theme}
                />

            </View>

            <View style={styles.bottomSection}>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <NavItem
                    icon={<Settings size={20} color={stage === 'SETTINGS' ? theme.tint : theme.icon} />}
                    label="Settings"
                    active={stage === 'SETTINGS'}
                    expanded={isHovered}
                    onPress={() => setStage('SETTINGS')}
                    theme={theme}
                />
            </View>
        </View>
    );
}

interface NavItemProps {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    expanded: boolean;
    onPress: () => void;
    theme: any;
}

const NavItem = ({ icon, label, active, expanded, onPress, theme }: NavItemProps) => {
    return (
        <TouchableOpacity
            onPress={onPress}
            style={[
                styles.iconButton,
                {
                    backgroundColor: active ? theme.tint + '12' : 'transparent',
                    borderLeftColor: active ? theme.tint : 'transparent',
                    flexDirection: expanded ? 'row' : 'column',
                    justifyContent: expanded ? 'flex-start' : 'center',
                    paddingLeft: expanded ? 13 : 0, // 16 - 3 (border width)
                    paddingRight: expanded ? 16 : 0,
                }
            ]}
        >
            {icon}
            {expanded && (
                <Text style={{
                    marginLeft: 12,
                    fontWeight: '600',
                    fontSize: 13,
                    letterSpacing: 0.2,
                    color: active ? theme.tint : theme.secondary,
                    fontFamily: Fonts?.body,
                }}>
                    {label}
                </Text>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        height: '100%',
        borderRightWidth: 0,
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        paddingBottom: 24,
        // @ts-ignore
        transitionDuration: '200ms',
        transitionProperty: 'width',
        zIndex: 100,
        shadowColor: "#000",
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 10,
    },
    logoSection: {
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        marginBottom: 16,
        gap: 10,
    },
    logoText: {
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    topSection: {
        gap: 4,
        alignItems: 'stretch',
    },
    bottomSection: {
        gap: 4,
        alignItems: 'stretch',
    },
    divider: {
        height: 1,
        marginHorizontal: 16,
        marginBottom: 8,
    },
    iconButton: {
        height: 46,
        alignItems: 'center',
        marginHorizontal: 8,
        borderRadius: 8,
        borderLeftWidth: 3,
    },
    label: {
        marginLeft: 12,
        fontWeight: '600',
        fontSize: 13,
        overflow: 'hidden',
    }
});
