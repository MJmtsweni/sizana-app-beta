import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

import { colors, fontFamily } from '../../theme';
type RatingModalProps = {
  visible: boolean;
  onClose: () => void;
  raterId: string;
  rateeId: string;
  rateeName: string;
  onSubmitted?: () => void;
};

export default function RatingModal({ visible, onClose, raterId, rateeId, rateeName, onSubmitted }: RatingModalProps) {
  const insets = useSafeAreaInsets();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (score === 0) {
      Alert.alert("Missing Rating", "Please select a star rating before submitting.");
      return;
    }
    if (!raterId || !rateeId) return;
    if (raterId === rateeId) {
      Alert.alert("Not Allowed", "You can't rate yourself.");
      return;
    }

    try {
      setSubmitting(true);
      const { error } = await supabase.from('user_reviews').insert({
        rater_id: raterId,
        ratee_id: rateeId,
        score,
        comment: comment.trim() || null,
      });

      if (error) {
        if (error.code === '23505') {
          Alert.alert("Already Reviewed", `You have already left a review for ${rateeName}.`);
        } else {
          throw error;
        }
      } else {
        
        // --- NEW NOTIFICATION LOGIC ---
        // Trigger the Notification to the seller
        const { error: notifError } = await supabase.from('notifications').insert({
          actor_id: raterId,       // The person leaving the rating
          receiver_id: rateeId,    // The seller getting rated
          type: 'seller_review',
          target_id: rateeId,      // We use the seller's ID so clicking it routes to their profile
          is_read: false,
        });

        if (notifError) {
          console.error("Seller rating notification error:", notifError.message);
        }
        // ------------------------------

        Alert.alert("Success", "Thank you! Your review has been posted.");
        setScore(0);
        setComment('');
        onClose();
        onSubmitted?.();
      }
    } catch (e: any) {
      Alert.alert("Error", "Could not submit review: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'flex-end' }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{
            backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
            padding: 24, paddingBottom: Math.max(insets.bottom, 24),
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 20, fontFamily: fontFamily.extrabold, color: colors.textPrimary }}>Rate {rateeName}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={{ fontFamily: fontFamily.regular, fontSize: 14, color: colors.slate[600], marginBottom: 20, textAlign: 'center' }}>
            How was your experience with {rateeName}?
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 24, gap: 8 }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => setScore(star)} style={{ padding: 4 }}>
                <Ionicons
                  name={score >= star ? "star" : "star-outline"}
                  size={40}
                  color={score >= star ? colors.warning : colors.borderStrong}
                />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 13, fontFamily: fontFamily.bold, color: colors.textSecondary, marginBottom: 6, marginLeft: 4 }}>
            Add a comment (Optional)
          </Text>
          <TextInput
            style={{
              backgroundColor: colors.backgroundMuted, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
              paddingHorizontal: 16, paddingVertical: 14, fontFamily: fontFamily.regular, fontSize: 15, color: colors.textPrimary,
              height: 100, textAlignVertical: 'top', marginBottom: 24,
            }}
            placeholder="Tell the community what you loved..."
            placeholderTextColor={colors.textTertiary}
            multiline
            value={comment}
            onChangeText={setComment}
          />

          <TouchableOpacity
            style={{
              backgroundColor: score > 0 ? colors.brand : colors.borderStrong,
              paddingVertical: 16, borderRadius: 16, alignItems: 'center',
            }}
            onPress={handleSubmit}
            disabled={score === 0 || submitting}
          >
            {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={{ color: colors.white, fontSize: 16, fontFamily: fontFamily.bold }}>Submit Review</Text>}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}