// Import script for trading dashboard data
// Run this in browser console on your dashboard to import all your challenges

const importData = () => {
  // Your trading data parsed from CSV
  const firms = [
    { id: 'breakout-001', name: 'Breakout', createdAt: '2024-12-01T00:00:00Z' },
    { id: 'maven-001', name: 'Maven', createdAt: '2024-12-01T00:00:00Z' },
    { id: 'think-capital-001', name: 'Think Capital', createdAt: '2024-12-01T00:00:00Z' },
    { id: 'elite-trader-001', name: 'Elite Trader Funding', createdAt: '2024-12-01T00:00:00Z' },
    { id: '8markets-001', name: '8Markets', createdAt: '2024-12-01T00:00:00Z' }
  ];

  const challenges = [
    // Breakout Challenges
    {
      id: 'challenge-001', propFirmId: 'breakout-001', brokerName: 'Breakout', accountSize: 10000, 
      startDate: '2025-01-01', cost: 100, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-002', propFirmId: 'breakout-001', brokerName: 'Breakout', accountSize: 25000,
      startDate: '2025-01-05', cost: 250, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-003', propFirmId: 'breakout-001', brokerName: 'Breakout', accountSize: 25000,
      startDate: '2025-01-06', cost: 250, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },

    // Maven Challenges
    {
      id: 'challenge-004', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 20000,
      startDate: '2025-01-10', cost: 88, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-005', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 50000,
      startDate: '2025-01-27', cost: 220, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-006', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 20000,
      startDate: '2025-02-03', cost: 88, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-007', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 5000,
      startDate: '2025-02-06', cost: 22, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-008', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 20000,
      startDate: '2025-02-13', cost: 88, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-009', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 20000,
      startDate: '2025-02-21', cost: 88, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-010', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 20000,
      startDate: '2025-02-21', cost: 88, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-011', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 20000,
      startDate: '2025-02-21', cost: 88, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-012', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 20000,
      startDate: '2025-02-21', cost: 88, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-013', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 20000,
      startDate: '2025-02-21', cost: 88, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-014', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 50000,
      startDate: '2025-03-03', cost: 224.40, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-015', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 20000,
      startDate: '2025-03-04', cost: 88, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-016', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 20000,
      startDate: '2025-03-04', cost: 88, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-017', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 20000,
      startDate: '2025-03-26', cost: 88, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-018', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 20000,
      startDate: '2025-03-26', cost: 88, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-019', propFirmId: 'maven-001', brokerName: 'Maven', accountSize: 20000,
      startDate: '2025-04-18', cost: 88, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },

    // Think Capital Challenges
    {
      id: 'challenge-020', propFirmId: 'think-capital-001', brokerName: 'Think Capital', accountSize: 50000,
      startDate: '2025-04-29', cost: 317.69, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-021', propFirmId: 'think-capital-001', brokerName: 'Think Capital', accountSize: 50000,
      startDate: '2025-05-02', cost: 336.37, totalPhases: 2, payouts: [
        { id: 'payout-001', amount: 2037.06, date: '2025-05-15' },
        { id: 'payout-002', amount: 3417.32, date: '2025-06-01' },
        { id: 'payout-003', amount: 965.17, date: '2025-06-15' }
      ],
      phases: { phase1: { completed: true, completedAt: '2025-05-10' }, phase2: { completed: true, completedAt: '2025-05-20' }, phase3: { completed: false } }
    },
    {
      id: 'challenge-022', propFirmId: 'think-capital-001', brokerName: 'Think Capital', accountSize: 100000,
      startDate: '2025-05-30', cost: 471.74, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-023', propFirmId: 'think-capital-001', brokerName: 'Think Capital', accountSize: 200000,
      startDate: '2025-07-02', cost: 516.81, totalPhases: 3, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },

    // Elite Trader Funding Challenges
    {
      id: 'challenge-024', propFirmId: 'elite-trader-001', brokerName: 'Elite Trader Funding', accountSize: 50000,
      startDate: '2025-04-30', cost: 16.50, totalPhases: 1, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-025', propFirmId: 'elite-trader-001', brokerName: 'Elite Trader Funding', accountSize: 50000,
      startDate: '2025-04-30', cost: 16.50, totalPhases: 1, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-026', propFirmId: 'elite-trader-001', brokerName: 'Elite Trader Funding', accountSize: 50000,
      startDate: '2025-04-30', cost: 16.50, totalPhases: 1, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },

    // 8Markets Challenges
    {
      id: 'challenge-027', propFirmId: '8markets-001', brokerName: '8Markets', accountSize: 100000,
      startDate: '2025-05-21', cost: 591.72, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-028', propFirmId: '8markets-001', brokerName: '8Markets', accountSize: 200000,
      startDate: '2025-05-30', cost: 987.96, totalPhases: 2, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-029', propFirmId: '8markets-001', brokerName: '8Markets', accountSize: 200000,
      startDate: '2025-07-10', cost: 602.37, totalPhases: 3, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-030', propFirmId: '8markets-001', brokerName: '8Markets', accountSize: 50000,
      startDate: '2025-07-23', cost: 188, totalPhases: 3, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-031', propFirmId: '8markets-001', brokerName: '8Markets', accountSize: 50000,
      startDate: '2025-08-04', cost: 169.20, totalPhases: 3, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-032', propFirmId: '8markets-001', brokerName: '8Markets', accountSize: 50000,
      startDate: '2025-09-01', cost: 208, totalPhases: 3, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    },
    {
      id: 'challenge-033', propFirmId: '8markets-001', brokerName: '8Markets', accountSize: 50000,
      startDate: '2025-09-28', cost: 208, totalPhases: 3, payouts: [],
      phases: { phase1: { completed: false }, phase2: { completed: false }, phase3: { completed: false } }
    }
  ];

  // Store in localStorage
  const appState = {
    firms: firms,
    challenges: challenges.map(c => ({
      ...c,
      monthlyPnL: {},
      weeklyPnL: {}
    })),
    selectedFirmId: null
  };

  localStorage.setItem('trading_dashboard_v1', JSON.stringify(appState));
  
  console.log(`✅ Successfully imported ${firms.length} firms and ${challenges.length} challenges!`);
  console.log('📊 Data includes:');
  console.log(`   • Breakout: 3 challenges`);
  console.log(`   • Maven: 16 challenges`);
  console.log(`   • Think Capital: 4 challenges (1 with payouts)`);
  console.log(`   • Elite Trader Funding: 3 challenges`);
  console.log(`   • 8Markets: 7 challenges`);
  console.log(`   • Total spent: $6,857.76`);
  console.log(`   • Total payouts: $6,419.55`);
  console.log('🔄 Please refresh the page to see your imported data!');
  
  return appState;
};

// Run the import
importData();