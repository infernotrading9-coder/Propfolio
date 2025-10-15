// Emergency Fix for React Error #300
// Run this in browser console if you're still getting the error

console.log('🚨 Running emergency data cleanup...');

try {
  // Get all localStorage keys related to trading dashboard
  const keysToCheck = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.includes('trading_dashboard')) {
      keysToCheck.push(key);
    }
  }
  
  console.log('Found keys:', keysToCheck);
  
  // Check each key for corrupted data
  keysToCheck.forEach(key => {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        console.log(`Key: ${key}`, parsed);
        
        // Check if challenges array exists and has valid structure
        if (parsed.challenges) {
          let hasCorruptedData = false;
          
          parsed.challenges.forEach((challenge, index) => {
            if (!challenge.phases || typeof challenge.phases !== 'object') {
              console.log(`⚠️ Challenge ${index} has corrupted phases:`, challenge);
              hasCorruptedData = true;
            }
            
            if (typeof challenge.cost !== 'number') {
              console.log(`⚠️ Challenge ${index} has invalid cost:`, challenge.cost);
              hasCorruptedData = true;
            }
            
            if (typeof challenge.accountSize !== 'number') {
              console.log(`⚠️ Challenge ${index} has invalid accountSize:`, challenge.accountSize);
              hasCorruptedData = true;
            }
          });
          
          if (hasCorruptedData) {
            console.log(`🧹 Removing corrupted data from ${key}`);
            localStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.log(`❌ Corrupted data found in ${key}, removing...`);
      localStorage.removeItem(key);
    }
  });
  
  console.log('✅ Emergency cleanup complete! Refresh the page.');
  
} catch (error) {
  console.error('Emergency cleanup failed:', error);
  console.log('💥 Clearing ALL trading dashboard data as last resort...');
  
  // Last resort - clear everything
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.includes('trading_dashboard')) {
      localStorage.removeItem(key);
    }
  }
  
  console.log('🎯 All data cleared. Please refresh the page.');
}