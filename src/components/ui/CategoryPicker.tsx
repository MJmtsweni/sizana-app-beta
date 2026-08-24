import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';

type Props = {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
  style?: object;
};

// The horizontal pill-list category/topic filter, hand-copied (in one case
// down to the exact same style values) across Business, Market, Events, and
// Forums' topic picker.
export default function CategoryPicker({ categories, selected, onSelect, style }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, style]}>
      {categories.map((cat) => {
        const active = selected === cat;
        return (
          <TouchableOpacity
            key={cat}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onSelect(cat)}
          >
            <Text style={[typography.bodyMedium, styles.text, active && styles.textActive]}>{cat}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.backgroundMuted,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  text: {
    color: colors.textSecondary,
  },
  textActive: {
    color: colors.textInverse,
  },
});
