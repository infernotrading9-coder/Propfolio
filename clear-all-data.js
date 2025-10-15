// Clear All Trading Dashboard Data
// Run this script in your browser's console to completely reset the app

console.log('🧹 Clearing all Trading Dashboard data...');

// Clear all localStorage keys related to trading dashboard
const keysToRemove = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && key.includes('trading_dashboard')) {
    keysToRemove.push(key);
  }
}

console.log(`Found ${keysToRemove.length} keys to remove:`, keysToRemove);

keysToRemove.forEach(key => {
  localStorage.removeItem(key);
  console.log(`✅ Removed: ${key}`);
});

// Clear any calendar data too
const calendarKeysToRemove = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && (key.includes('rule_calendar') || key.includes('calendar'))) {
    calendarKeysToRemove.push(key);
  }
}

calendarKeysToRemove.forEach(key => {
  localStorage.removeItem(key);
  console.log(`✅ Removed calendar data: ${key}`);
});

console.log('🎉 All data cleared! Please refresh the page to see the empty state.');
console.log('💡 The app will now start with no prop firms - you can add your own.');

// Optional: reload the page automatically
// location.reload();