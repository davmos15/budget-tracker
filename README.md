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
- Pay day set from one real pay date (weekly, fortnightly, every 4 weeks, monthly…, with weekend handling); drives the transfer schedule
- Automatic yearly/monthly conversion display
- Person management with preset color picker

### Bills Account
- **Required today** — what should already be set aside for every bill, plus your credit-card balance and any buffers, plus what bills build up until everyone's next transfer, minus those transfers. Never less than the cash needed for bills due before the transfers land.
- **Surplus / shortfall** against the balance you enter (with a reminder when the balance is over a week old)
- **Transfer plan** — how much each person should move in, and when, so money in matches bills out over the year. Split by income, equally, by bill owner, or fixed amounts with one person topping up the rest
- **60-day forecast** of the balance against what should be set aside, with an overdraft warning
- Each bill shows how much is set aside so far, a progress bar and its next due date
- Automatic payments (direct debit, standing order, card) roll to the next due date on their own; manual bills get a **Paid** button (with undo)
- Bills paid from elsewhere (e.g. groceries) can be excluded from the bills account but still count in the budget
- Buffers for fixed amounts that should always stay in the account

### How the numbers are worked out
All calculations live in `src/lib/` (pure functions, unit tested with `npm test`):
- `dates.js` — local calendar-day dates (no timezone off-by-one)
- `schedule.js` — recurring dates: weekly → yearly, keeps the day of month, optional "Friday before / Monday after" for weekends
- `finance.js` — per-period conversions, bill status, transfer plan, bills snapshot and forecast
- `migrate.js` — upgrades older budgets in memory (old pay/transfer settings become schedules)

### Onboarding
- Guided setup wizard for new budgets
- Step-by-step walkthrough of all app features
- Pre-populated common expense templates (30+ items across 8 categories)
- Toggle expenses on/off and adjust amounts during setup
- Income entry with live budget summary
- Skip option available at any step

### Info Tooltips
- Contextual help icons on every major section
- Click to reveal explanations of how each feature works
- Same content as onboarding for consistent guidance

### Settings
- Currency support: $, EUR, GBP, JPY, INR, RUB, ZAR, KRW, AUD, NZD, CAD
- Date format options (US, EU, ISO, text formats) - default DD/MM/YYYY
- How bills are shared, and per-person transfer days (defaults to payday)
- Sticky save bar when changes are pending
- Budget sharing and user management (admin only)
- Delete budget (owner) or leave budget (member) with confirmation
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

4. Run the tests:
```bash
npm test
```

5. Start the development server:
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
│   │   ├── ShareBudgetModal.jsx
│   │   ├── OnboardingFlow.jsx
│   │   └── InfoTooltip.jsx
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

## Support

If you find this project useful, consider supporting it!

<a href="https://www.buymeacoffee.com/nadavmoskow" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="40"></a>

## License

This project is open source and available under the MIT License.

---

Made with care by [davmos15](https://github.com/davmos15)
