# Budget Tracker

A modern, mobile-first budget tracking PWA with real-time collaboration, smart notifications, and intelligent bill allocation. Built with React, Firebase, and Tailwind CSS.

![React](https://img.shields.io/badge/React-19-blue) ![Vite](https://img.shields.io/badge/Vite-6-purple) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-cyan) ![Firebase](https://img.shields.io/badge/Firebase-11-orange) ![PWA](https://img.shields.io/badge/PWA-Ready-green)

## Features

### Authentication & Collaboration
- Firebase Authentication with email/password and Google sign-in
- Real-time data synchronization across all devices
- Budget sharing with 6-character invite codes
- Multi-budget support with role-based access (admin/member)
- Account management with user removal and admin promotion

### Dashboard
- Income, expenses, savings, and disposable income summary cards
- Weekly, Fortnightly, Monthly, and Yearly view modes
- Interactive donut chart with hover/click highlight, bar chart, and table views for expense breakdown by category
- Expandable category drill-down showing individual expenses with payment types
- Smart notifications panel with alerts for:
  - Overdue payments
  - Upcoming bills (next 7 days)
  - Expiring subscriptions (next 30 days)
  - Price change warnings
  - Manual transfer reminders

### Expense Management
- Separate tracking for expenses and savings (savings have no category)
- Payment types: Direct Debit, Standing Order, Manual Transfer, Card Payment
- Auto-calculated next due dates for direct debits and standing orders
- Subscription end date tracking with expiry reminders
- Price change tracking (date and new amount)
- Custom categories with color coding
- Search and filter by category, person, payment type
- Sortable table columns (click any header to sort ascending/descending)
- Responsive card layout on mobile, table on desktop

### Income Tracking
- Multiple income sources per person
- Pay day scheduling (specific day of month, or day of week with interval)
- Automatic yearly/monthly conversion display
- Person management with preset color picker

### Bill Allocation
- **Total Bills Owing** - calculated from all expenses based on transfer schedule
- **Smart required amounts** - steps up with each completed transfer rather than daily proration (e.g. a $300 monthly bill with fortnightly transfers shows $0 → $150 → $300)
- **Current Bills Account** - manually enter your actual balance
- **Excess / Deficit** - auto-calculated difference shown in green/red
- Per-person balance breakdown with last transfer tracking
- Quick "Today" button to record transfers
- Transfer reminders based on configured schedule
- Sortable table columns for bill breakdown
- Static amounts for emergency funds or buffers
- Auto-update next due dates when marking bills as paid

### Settings
- Currency support: $, EUR, GBP, JPY, INR, RUB, ZAR, KRW, AUD, NZD, CAD
- Date format options (US, EU, ISO, text formats)
- Per-person transfer frequency and schedule configuration
- Sticky save bar when changes are pending
- Budget sharing and user management (admin only)
- Account deletion with confirmation

### Progressive Web App (PWA)
- Install on mobile via "Add to Home Screen" - works like a native app
- Bottom navigation bar on mobile, top tabs on desktop
- Offline-capable with service worker caching
- Safe area support for notched phones
- Touch-optimized inputs (no iOS zoom)

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm
- Firebase project (free tier works)

### Installation

1. Clone the repository:
```bash
git clone git@github.com:davmos15/budget-tracker.git
cd budget-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` with your Firebase config:
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

4. Start the development server:
```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Mobile Installation (PWA)
1. Deploy the built app to any static hosting (Firebase Hosting, Vercel, Netlify)
2. Visit the URL on your phone in Chrome (Android) or Safari (iOS)
3. Tap "Add to Home Screen"
4. The app launches in standalone mode with full sync via Firebase

## Tech Stack

- **React 19** - UI framework with hooks
- **Vite 6** - Build tool
- **Tailwind CSS 3** - Utility-first CSS with custom design system
- **Firebase 11** - Auth, Firestore, real-time sync
- **Lucide React** - Icon library
- **Recharts** - Charting library

## Project Structure

```
budget-tracker/
├── src/
│   ├── components/
│   │   ├── Auth/
│   │   │   ├── Login.jsx
│   │   │   └── Signup.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Expenses.jsx
│   │   ├── Salaries.jsx
│   │   ├── BillAllocation.jsx
│   │   ├── Settings.jsx
│   │   ├── BudgetApp.jsx
│   │   ├── BudgetSelection.jsx
│   │   └── ShareBudgetModal.jsx
│   ├── contexts/
│   │   └── FirebaseContext.jsx
│   ├── firebase.js
│   ├── App.jsx
│   ├── AppWrapper.jsx
│   ├── main.jsx
│   └── index.css
├── public/
│   ├── icons/
│   ├── manifest.json
│   └── sw.js
├── .env.example
├── index.html
├── package.json
├── tailwind.config.js
├── postcss.config.js
└── vite.config.js
```

## License

This project is open source and available under the MIT License.

---

Made with care by [davmos15](https://github.com/davmos15)
