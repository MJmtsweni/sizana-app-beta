import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type Scope = 'nearby' | 'home' | 'explore';

type ScopeToggleProps = {
  scope: Scope;
  onChange: (scope: Scope) => void;
  // Shown as a small subtitle so it's clear whether Near Me is using live
  // GPS or has fallen back to the Home-style profile-location match.
  nearbyModeLabel?: string | null;
};

const TABS: { key: Scope; label: string; icon: any }[] = [
  { key: 'nearby', label: 'Near Me', icon: 'navigate' },
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'explore', label: 'Explore', icon: 'earth' },
];

export default function ScopeToggle({ scope, onChange, nearbyModeLabel }: ScopeToggleProps) {
  return (
    <View>
      <View style={styles.row}>
        {TABS.map((tab) => {
          const active = scope === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.pill, active && styles.pillActive]}
              onPress={() => onChange(tab.key)}
            >
              <Ionicons name={tab.icon} size={13} color={active ? '#fff' : '#34C759'} />
              <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {scope === 'nearby' && nearbyModeLabel && (
        <Text style={styles.subtitle}>{nearbyModeLabel}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  pill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 14, backgroundColor: '#F0FDF4',
    borderWidth: 1, borderColor: '#DCFCE7',
  },
  pillActive: { backgroundColor: '#34C759', borderColor: '#34C759' },
  text: { fontSize: 12, fontWeight: '700', color: '#34C759', marginLeft: 5 },
  textActive: { color: '#fff' },
  subtitle: { fontSize: 11, color: '#94A3B8', fontWeight: '600', paddingHorizontal: 16, paddingTop: 6 },
});