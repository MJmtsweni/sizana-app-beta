import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  // Most forms want the body scrollable; a couple of small confirm-style
  // sheets pass false to lay out content directly without a ScrollView.
  scrollable?: boolean;
  maxHeightPercent?: number;
};

// The bottom-sheet modal shell (overlay, rounded card, header + close
// button, keyboard-avoiding scroll body) that was hand-copied with minor
// variations across most of the app's create/edit forms.
export default function ModalSheet({ visible, onClose, title, children, scrollable = true, maxHeightPercent = 90 }: Props) {
  const body = scrollable ? (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {children}
      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
  ) : (
    children
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={[styles.content, { maxHeight: `${maxHeightPercent}%` }]}
            >
              <View style={styles.header}>
                <Text style={[typography.h2, styles.title]}>{title}</Text>
                <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
                  <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {body}
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl + 4,
    borderTopRightRadius: radii.xl + 4,
    padding: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
  },
});
