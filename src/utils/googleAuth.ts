// Utility functions for Google OAuth

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

// Decode JWT token (client-side only, for basic info extraction)
export const decodeGoogleToken = (token: string): GoogleUser | null => {
  try {
    // JWT has 3 parts separated by dots
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT token format');
    }

    // Decode the payload (middle part)
    const payload = parts[1];
    
    // Add padding if needed for proper base64 decoding
    const paddedPayload = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    
    // Decode base64
    const decodedPayload = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    
    // Parse JSON
    const userData = JSON.parse(decodedPayload);
    
    // Extract relevant user information
    return {
      id: userData.sub, // Google's unique user ID
      email: userData.email,
      name: userData.name,
      picture: userData.picture,
      given_name: userData.given_name,
      family_name: userData.family_name,
    };
  } catch (error) {
    console.error('Failed to decode Google token:', error);
    return null;
  }
};

// Validate that the token is not expired
export const isTokenValid = (token: string): boolean => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const payload = parts[1];
    const paddedPayload = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decodedPayload = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    const userData = JSON.parse(decodedPayload);

    // Check if token is expired
    const currentTime = Math.floor(Date.now() / 1000);
    return userData.exp > currentTime;
  } catch (error) {
    return false;
  }
};

// Generate a unique username from email
export const generateUsernameFromEmail = (email: string): string => {
  return email.split('@')[0].toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
};