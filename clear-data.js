// Utility to clear stored data and start fresh
// Run this in the browser console if you want to remove default firms

console.log("🗑️  Clearing all trading dashboard data...");

// Clear all possible storage keys
const keysToCheck = [
  'trading_dashboard_prop_firm_v1',
  'trading_dashboard_calendar_v1',
  'demo_users',
  'user',
  'dashboard_building_mode'
];

// Get all localStorage keys that start with our app prefixes
const allKeys = Object.keys(localStorage);
const appKeys = allKeys.filter(key => 
  key.startsWith('trading_dashboard_') ||
  key === 'demo_users' ||
  key === 'user' ||
  key === 'dashboard_building_mode'
);

console.log("📋 Found storage keys:", appKeys);

// Clear all app-related data
appKeys.forEach(key => {
  localStorage.removeItem(key);
  console.log("❌ Removed:", key);
});

console.log("✅ All data cleared! Refresh the page to start fresh.");
console.log("🎯 You can now add only the prop firms you actually use.");

// Auto-reload the page
setTimeout(() => {
  window.location.reload();
}, 2000);