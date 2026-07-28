import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, Image, TouchableOpacity, Modal, ScrollView, 
  Dimensions, Alert, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import RatingModal from './RatingModal';

const { width, height } = Dimensions.get('window');

const LISTING_TYPE_LABELS: Record<string, string> = {
  product: 'Product',
  service: 'Service',
  property: 'Property',
  vehicle: 'Vehicle',
  job: 'Job',
};

type ListingDetailsModalProps = {
  visible: boolean;
  item: any | null;
  session: any;
  navigation: any;
  onClose: () => void;
  // Called after anything that changes the underlying data (edit, delete, new review)
  // so the parent screen's list can refetch and stay in sync.
  onChanged?: () => void;
  // Only screens that actually own listing management (MarketScreen) pass this in.
  // When omitted, the "•••" manage button never renders — e.g. PublicProfileScreen
  // is a pure viewing surface and has no edit/delete flow of its own.
  onManage?: (item: any) => void;
};

export default function ListingDetailsModal({
  visible, item, session, navigation, onClose, onChanged, onManage,
}: ListingDetailsModalProps) {
  const [isFollowingSeller, setIsFollowingSeller] = useState(false);
  const [isFollowingBusiness, setIsFollowingBusiness] = useState(false);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);

  useEffect(() => {
    if (visible && item) {
      setIsFollowingSeller(false);
      setIsFollowingBusiness(false);
      checkFollowStatus(item);
    }
  }, [visible, item?.id]);

  async function checkFollowStatus(current: any) {
    if (!session?.user?.id) return;

    if (current.business_id && current.business) {
      if (session.user.id === current.business.creator_id) return;
      try {
        const { data } = await supabase
          .from('business_followers')
          .select('id')
          .match({ business_id: current.business_id, user_id: session.user.id })
          .single();
        if (data) setIsFollowingBusiness(true);
      } catch {
        setIsFollowingBusiness(false);
      }
    } else {
      if (session.user.id === current.seller_id) return;
      try {
        const { data } = await supabase
          .from('user_followers')
          .select('id')
          .match({ follower_id: session.user.id, following_id: current.seller_id })
          .single();
        if (data) setIsFollowingSeller(true);
      } catch {
        setIsFollowingSeller(false);
      }
    }
  }

  const handleFollowSeller = async (sellerId: string, sellerName: string) => {
    Alert.alert('Connect', `Follow ${sellerName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Follow',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('user_followers')
              .insert({ follower_id: session.user.id, following_id: sellerId });
            if (error) throw error;
            setIsFollowingSeller(true);
            Alert.alert('Success', `You are now following ${sellerName}.`);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        }
      }
    ]);
  };

  // Mirrors BusinessProfileScreen's toggleFollow exactly, so following a business
  // behaves identically no matter which screen it was triggered from.
  const handleFollowBusiness = async (businessId: string, businessName: string, businessCreatorId: string) => {
    Alert.alert('Connect', `Follow ${businessName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Follow',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('business_followers')
              .insert({ business_id: businessId, user_id: session.user.id });
            if (error) throw error;

            setIsFollowingBusiness(true);

            if (session.user.id !== businessCreatorId) {
              await supabase.from('notifications').insert({
                actor_id: session.user.id,
                receiver_id: businessCreatorId,
                type: 'follow',
                target_id: businessId,
                is_read: false,
              });
            }
            Alert.alert('Success', `You are now following ${businessName}.`);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        }
      }
    ]);
  };

  const handlePosterProfilePress = () => {
    if (!item) return;
    onClose();

    if (item.business_id && item.business) {
      navigation.navigate('BusinessProfile', { business: item.business, session });
      return;
    }

    if (item.seller_id === session?.user?.id) {
      navigation.navigate('Profile', { session });
    } else {
      const userProfile = {
        id: item.seller_id,
        username: item.users?.username,
        avatar_url: item.users?.avatar_url,
      };
      navigation.navigate('PublicProfile', { userProfile, session });
    }
  };

  const handleMessagePoster = () => {
    if (!item) return;

    const isBusinessPost = !!(item.business_id && item.business);
    const posterId = isBusinessPost ? item.business.creator_id : item.seller_id;
    const posterName = isBusinessPost ? item.business.name : (item.users?.username || 'Sizana Member');

    if (posterId === session?.user?.id) {
      Alert.alert('Marketplace Rule', 'You cannot message yourself about your own listing.');
      return;
    }

    onClose();

    navigation.navigate('Inbox', {
      session,
      sellerId: posterId,
      sellerName: posterName,
      businessId: isBusinessPost ? item.business.id : undefined,
      contextItem: item,
      itemId: item.id,
    });
  };

  const formatCurrency = (amount: number) => `R ${Number(amount).toLocaleString('en-ZA')}`;

  if (!item) return null;

  const ratingTarget = item.business_id && item.business
    ? { id: item.business.creator_id, name: item.business.name }
    : { id: item.seller_id, name: item.users?.username || 'this seller' };

  const isOwnPost = item.business_id && item.business
    ? item.business.creator_id === session?.user?.id
    : item.seller_id === session?.user?.id;

  return (
    <>
      <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
        <View style={styles.detailsModalOverlay}>
          <View style={styles.detailsModalContent}>

            <View style={styles.detailsHeaderActions}>
              <TouchableOpacity style={styles.circularCloseButton} onPress={onClose}>
                <Ionicons name="arrow-back" size={24} color="#1E293B" />
              </TouchableOpacity>

              <Text style={styles.detailsHeaderTitle}>
                {LISTING_TYPE_LABELS[item.listing_type] || 'Listing'}
              </Text>

              {isOwnPost && onManage ? (
                <TouchableOpacity
                  style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => onManage(item)}
                >
                  <Ionicons name="ellipsis-horizontal" size={24} color="#1E293B" />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 40 }} />
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

              <View style={styles.fullSizeImageFrame}>
                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={styles.fullProductImage} />
                ) : (
                  <View style={styles.fullPlaceholderImage}>
                    <Ionicons name="image-outline" size={80} color="#CBD5E1" />
                  </View>
                )}
              </View>

              <View style={styles.detailsBodyTextWrapper}>
                <Text style={styles.detailsPriceText}>
                  {formatCurrency(item.price)}{item.listing_type === 'job' ? ' /mo' : ''}
                </Text>
                <Text style={styles.detailsTitleText}>{item.title}</Text>

                <View style={styles.detailsMetaRow}>
                  <View style={styles.metaBadgePill}>
                    <Ionicons name="pricetag" size={12} color="#475569" style={{ marginRight: 4 }} />
                    <Text style={styles.metaBadgeText}>{item.category}</Text>
                  </View>
                  <View style={styles.metaBadgePill}>
                    <Ionicons name="location" size={12} color="#34C759" style={{ marginRight: 4 }} />
                    <Text style={styles.metaBadgeText}>{item.location}</Text>
                  </View>
                </View>

                <View style={styles.dividerLine} />

                <Text style={styles.detailsSectionHeading}>Description</Text>
                <Text style={styles.detailsDescriptionBody}>{item.description || 'No description was provided.'}</Text>

                <View style={styles.dividerLine} />

                <Text style={styles.detailsSectionHeading}>
                  {item.business_id ? 'Posted By' : 'Seller Profile Information'}
                </Text>

                {item.business_id && item.business ? (
                  // --- BUSINESS-POSTED JOB ---
                  <View style={styles.sellerProfileLayoutRow}>
                    <TouchableOpacity 
                      style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                      activeOpacity={0.7}
                      onPress={handlePosterProfilePress}
                    >
                      <View style={styles.sellerAvatarWrapper}>
                        {item.business.logo_url ? (
                          <Image source={{ uri: item.business.logo_url }} style={styles.sellerAvatarImage} />
                        ) : (
                          <Ionicons name="briefcase" size={24} color="#CBD5E1" />
                        )}
                      </View>

                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.sellerNameLabel}>{item.business.name}</Text>

                          {item.business.creator_id !== session?.user?.id && !isFollowingBusiness && (
                            <TouchableOpacity 
                              style={styles.plusButton} 
                              onPress={() => handleFollowBusiness(item.business.id, item.business.name, item.business.creator_id)}
                            >
                              <Ionicons name="add" size={14} color="#fff" />
                            </TouchableOpacity>
                          )}
                        </View>
                        <Text style={styles.sellerTierLabelMuted}>Hiring business</Text>
                      </View>
                    </TouchableOpacity>

                    {item.business.creator_id !== session?.user?.id && (
                      <TouchableOpacity 
                        style={{ marginTop: 4 }}
                        onPress={() => {
                          onClose();
                          setTimeout(() => setRatingModalVisible(true), 350);
                        }} 
                      >
                        <Text style={styles.rateSellerLink}>Rate this business</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  // --- INDIVIDUAL SELLER ---
                  <View style={styles.sellerProfileLayoutRow}>
                    <TouchableOpacity 
                      style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                      activeOpacity={0.7}
                      onPress={handlePosterProfilePress}
                    >
                      <View style={styles.sellerAvatarWrapper}>
                        {item.users?.avatar_url ? (
                          <Image source={{ uri: item.users.avatar_url }} style={styles.sellerAvatarImage} />
                        ) : (
                          <Ionicons name="person-circle" size={44} color="#CBD5E1" />
                        )}
                      </View>

                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.sellerNameLabel}>{item.users?.username || 'Sizana Community Member'}</Text>

                          {item.seller_id !== session?.user?.id && !isFollowingSeller && (
                            <TouchableOpacity 
                              style={styles.plusButton} 
                              onPress={() => handleFollowSeller(item.seller_id, item.users?.username || 'this seller')}
                            >
                              <Ionicons name="add" size={14} color="#fff" />
                            </TouchableOpacity>
                          )}
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                          {item.users?.rating != null ? (
                            <Text style={styles.sellerTierLabel}>⭐ {Number(item.users.rating).toFixed(1)}</Text>
                          ) : (
                            <Text style={styles.sellerTierLabelMuted}>New Member</Text>
                          )}
                          {item.users?.is_verified && (
                            <Text style={[styles.sellerTierLabel, { marginLeft: 8 }]}>✓ Verified</Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>

                    {item.seller_id !== session?.user?.id && (
                      <TouchableOpacity 
                        style={{ marginTop: 4 }}
                        onPress={() => {
                          onClose();
                          setTimeout(() => setRatingModalVisible(true), 350);
                        }} 
                      >
                        <Text style={styles.rateSellerLink}>Rate this seller</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {!isOwnPost && (
                  <TouchableOpacity style={styles.messageSellerActionButton} onPress={handleMessagePoster}>
                    <Ionicons name="chatbubble-ellipses" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.messageSellerButtonText}>
                      {item.listing_type === 'job' ? 'Enquire About This Job' : 'Message Seller'}
                    </Text>
                  </TouchableOpacity>
                )}

              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <RatingModal
        visible={ratingModalVisible}
        onClose={() => setRatingModalVisible(false)}
        raterId={session?.user?.id}
        rateeId={ratingTarget.id}
        rateeName={ratingTarget.name}
        onSubmitted={onChanged}
      />
    </>
  );
}

const styles = StyleSheet.create({
  detailsModalOverlay: { flex: 1, backgroundColor: '#fff' },
  detailsModalContent: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 20 },
  detailsHeaderActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 50, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  circularCloseButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  detailsHeaderTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  fullSizeImageFrame: { width: width, height: height * 0.4, backgroundColor: '#F1F5F9' },
  fullProductImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  fullPlaceholderImage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  detailsBodyTextWrapper: { padding: 24 },
  detailsPriceText: { fontSize: 26, fontWeight: '900', color: '#1E293B' },
  detailsTitleText: { fontSize: 20, fontWeight: '700', color: '#475569', marginTop: 4, lineHeight: 26 },
  detailsMetaRow: { flexDirection: 'row', marginTop: 12 },
  metaBadgePill: { flexDirection: 'row', backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginRight: 8, alignItems: 'center' },
  metaBadgeText: { fontSize: 12, color: '#475569', fontWeight: '700' },
  dividerLine: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 20 },
  detailsSectionHeading: { fontSize: 12, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  detailsDescriptionBody: { fontSize: 15, color: '#334155', fontWeight: '500', lineHeight: 24 },
  sellerProfileLayoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sellerAvatarWrapper: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#F1F5F9', overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  sellerAvatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  sellerNameLabel: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  sellerTierLabel: { fontSize: 12, fontWeight: '600', color: '#34C759', marginTop: 1 },
  messageSellerActionButton: { backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 32, shadowColor: '#34C759', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 3 },
  messageSellerButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sellerTierLabelMuted: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  rateSellerLink: { fontSize: 12, fontWeight: '700', color: '#3B82F6', marginTop: 4 },
  plusButton: { backgroundColor: '#34C759', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
});