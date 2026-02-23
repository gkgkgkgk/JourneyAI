import React from 'react';
import { StyleSheet, View } from 'react-native';
import MainLayout from '@/components/MainLayout';

import { JourneyProvider } from '@/context/JourneyContext';

export default function HomeScreen() {
  return (
    <JourneyProvider>
      <View style={styles.container}>
        <MainLayout />
      </View>
    </JourneyProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
