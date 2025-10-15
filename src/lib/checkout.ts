import { PlanType, PRICING_PLANS } from './stripe';

export const createCheckoutSession = async (plan: PlanType) => {
  try {
    const planDetails = PRICING_PLANS[plan];
    if (!planDetails.priceId) {
      throw new Error(`No price ID found for plan: ${plan}`);
    }

    // Modern approach: Use Payment Links (recommended by Stripe for simple use cases)
    // You'll need to create these Payment Links in your Stripe Dashboard
    
    // Live Payment Links from your Stripe Dashboard
    const paymentLinks = {
      pro: 'https://buy.stripe.com/4gM4gzaXY881foS1ByfQI01'
    };

    const paymentLink = paymentLinks[plan as keyof typeof paymentLinks];
    
    if (!paymentLink || paymentLink.includes('YOUR_')) {
      // Guide user to create Payment Links
      const message = `To complete the checkout integration:\n\n` +
        `1. Go to your Stripe Dashboard\n` +
        `2. Go to Products → Payment Links\n` +
        `3. Create a Payment Link for your ${plan.toUpperCase()} plan\n` +
        `4. Set success URL to: ${window.location.origin}/dashboard\n` +
        `5. Set cancel URL to: ${window.location.origin}/pricing\n` +
        `6. Replace the payment link in the code\n\n` +
        `This is the modern way to handle Stripe payments!`;
      
      alert(message);
      return;
    }

    // Redirect to Stripe Payment Link
    window.location.href = paymentLink;
    
  } catch (error) {
    console.error('Checkout session creation failed:', error);
    throw error;
  }
};

// Helper function to extract session ID from URL
export const getSessionIdFromUrl = (): string | null => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('session_id');
};

// Helper function to clear session ID from URL
export const clearSessionIdFromUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('session_id');
  window.history.replaceState({}, '', url.toString());
};