// Region + interest options shared by sign-up, social-sign-in onboarding,
// and profile editing — one source so the lists can't drift apart.

export const MAX_REGIONS = 3;

export const INTEREST_CATEGORIES = [
  'Parties & Celebrations', 'Weddings', 'Music & Concerts', 'Arts & Entertainment', 
  'Sports & Fitness', 'Business & Networking', 'Education & Learning', 'Technology & Gaming', 
  'Food & Drink', 'Markets & Shopping', 'Community & Charity', 'Religious & Spiritual', 
  'Family & Kids', 'Cultural & Heritage', 'Health & Wellness', 'Outdoor & Nature', 
  'Automotive', 'Pets & Animals', 'Private Events', 'Online & Virtual', 
  'Government & Public Services', 'Other'
];

export const SA_REGIONS: Record<string, string[]> = {
  "Gauteng": ["Johannesburg", "Pretoria", "Centurion", "Midrand"],
  "North West": ["Vryburg", "Taung", "Potchefstroom", "Klerksdorp", "Mahikeng", "Rustenburg"],
  "Western Cape": ["Cape Town", "Stellenbosch", "George", "Paarl"],
  "KwaZulu-Natal": ["Durban", "Pietermaritzburg", "Richards Bay"],
  "Free State": ["Bloemfontein", "Welkom"],
  "Eastern Cape": ["Gqeberha", "East London", "Mthatha"],
  "Limpopo": ["Polokwane", "Tzaneen"],
  "Mpumalanga": ["Nelspruit", "Witbank"],
  "Northern Cape": ["Kimberley", "Upington"]
};
