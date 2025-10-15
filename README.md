# Rule Calendar - Day Trading Tracker

A modern, dark-themed calendar application for tracking day trading rule adherence across multiple accounts.

## Features

✅ **Multi-Account Management**
- Create, rename, and delete trading accounts
- Keep separate statistics for each account
- Easy account switching

✅ **Interactive Calendar**
- Click weekdays (Monday-Friday) to track rule adherence
- Visual indicators for rule following status
- Dark theme with colorful modern icons

✅ **Comprehensive Statistics**
- Overall success rate percentage
- Current month performance
- Rule-following streak tracking
- Trading day breakdown

✅ **Smart Data Handling**
- Local storage persistence
- Weekday-only tracking (excludes weekends)
- No-trade days don't affect statistics

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

## How to Use

1. **Create an Account**: Click "Add New Account" and enter a name for your trading account
2. **Track Your Rules**: Click on weekdays in the calendar to mark whether you followed your rules:
   - ✅ Green: Followed Rules
   - ❌ Red: Broke Rules  
   - ➖ Gray: No Trade
3. **View Statistics**: See your performance metrics at the bottom, including success rate and streaks
4. **Manage Accounts**: Create multiple accounts for different strategies or brokers

## Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling and dark theme
- **Lucide React** - Modern colorful icons
- **Vite** - Build tool and dev server

## Project Structure

```
src/
├── components/          # React components
│   ├── AccountManager.tsx    # Account management UI
│   ├── Calendar.tsx         # Interactive calendar
│   └── Statistics.tsx       # Stats display
├── utils/              # Utility functions
│   ├── storage.ts          # Local storage management
│   └── dateUtils.ts        # Date manipulation helpers
├── types.ts            # TypeScript type definitions
├── App.tsx            # Main application component
├── main.tsx           # React entry point
└── index.css          # Global styles
```

## License

MIT License - feel free to use this project for your trading discipline tracking!