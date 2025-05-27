# Budget Tracker

A comprehensive React-based budget tracking application with **real-time collaboration**, **Firebase authentication**, and support for multiple users, expense categories, income sources, and intelligent bill allocation.

![Budget Tracker](https://img.shields.io/badge/React-18.0-blue) ![Vite](https://img.shields.io/badge/Vite-5.0-purple) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.0-cyan) ![Firebase](https://img.shields.io/badge/Firebase-11.0-orange)

## 🌟 Features

### 🔐 Authentication & Collaboration
- **Firebase Authentication** with email/password and Google sign-in
- **Real-time data synchronization** across all users
- **Budget sharing** with 6-character codes
- **Multi-budget support** - belong to multiple budgets
- **Secure data storage** with Firebase Firestore

### 📊 Dashboard Overview
- Real-time income, expenses, and savings summary with multiple view modes (Weekly, Fortnightly, Monthly, Yearly)
- Interactive charts (Pie, Bar, Table views) for income and expense visualization
- Expandable category breakdowns showing individual expenses
- Visual breakdown by person and category

### 💰 Expense Management
- Add, edit, and delete expenses with ease
- Custom categories with color coding and inline editing
- Advanced filtering by category, person, and frequency
- Multiple view modes with automatic amount conversion
- Company tracking for each expense

### 💼 Income Tracking
- Manage multiple income sources per person
- Support for various payment frequencies
- Person management with customizable colors
- Automatic yearly/monthly/weekly calculations

### 🧮 Bill Allocation Calculator
- Track bills account balance based on payment cycles
- Individual "last paid" dates for each bill
- Static amounts for emergency funds or buffers
- Per-person bill allocation tracking
- Last transfer tracking for each person

### ⚙️ Customizable Settings
- Multiple currency symbol support ($, €, £, ¥, ₹, ₽, R, ₩)
- Various date format options (US, EU, ISO, and text formats)
- Per-person transfer frequency settings with specific days/dates
- Flexible scheduling options (weekly, fortnightly, monthly, quarterly)

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Firebase project (free tier works great)

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

3. Firebase Configuration:
   - The Firebase config is already included in `src/firebase.js`
   - For production, consider using environment variables (see `.env.example`)

4. Start the development server:
```bash
npm run dev
```

5. Open your browser and navigate to `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## 📱 Usage Guide

### Getting Started
1. **Sign Up/Login** - Create an account with email or Google
2. **Create a Budget** - Start a new budget with a custom name
3. **Share Budget** - Use the 6-character code to invite others
4. **Join Budget** - Enter a shared code to join existing budgets

### Adding Expenses
1. Navigate to the "Expenses" tab
2. Click "Add Expense"
3. Fill in the expense details (name, amount, category, person, frequency, company)
4. Create new categories on-the-fly using the dropdown option
5. Click "Add Expense" to save

### Managing Income
1. Go to the "Salaries" tab
2. Click "Add Salary" to add a new income source
3. Edit person details including their color by clicking the edit icon
4. View total income summaries per person

### Bill Allocation
1. Navigate to "Bill Allocation"
2. Set "last paid" dates for each bill individually
3. Track last transfers from each person
4. Add static amounts for buffer funds
5. Monitor total bills account balance and per-person shares

### Dashboard Analytics
1. Switch between Weekly, Fortnightly, Monthly, and Yearly views
2. Toggle between Table, Pie Chart, and Bar Chart visualizations
3. Click on categories to expand and see individual expense details
4. Monitor real-time savings calculations

### Customizing Settings
1. Go to the "Settings" tab
2. Choose your preferred currency symbol
3. Select from multiple date format options
4. Configure per-person transfer schedules:
   - Specific day of week (e.g., every Friday)
   - Specific day of month (e.g., 15th of each month)
   - Specific week & day of month (e.g., 2nd Tuesday of each month)

## 🛠️ Tech Stack

- **React 18** - UI framework with hooks
- **Vite** - Lightning-fast build tool
- **Tailwind CSS** - Utility-first CSS framework
- **Firebase** - Authentication and real-time database
  - Firebase Auth (Email/Password & Google OAuth)
  - Cloud Firestore (NoSQL database)
  - Real-time data synchronization
- **Lucide React** - Beautiful icon library
- **Recharts** - Composable charting library
- **React Hooks** - State management using useState, useEffect, useMemo

## 📁 Project Structure

```
budget-tracker/
├── src/
│   ├── components/
│   │   ├── Auth/              # Authentication components
│   │   │   ├── Login.jsx      # Login form with email/Google
│   │   │   └── Signup.jsx     # Signup form with validation
│   │   ├── Dashboard.jsx      # Main overview with charts
│   │   ├── Expenses.jsx       # Expense management
│   │   ├── Salaries.jsx       # Income management
│   │   ├── BillAllocation.jsx # Bill tracking
│   │   ├── Settings.jsx       # App configuration
│   │   ├── BudgetApp.jsx      # Main budget interface
│   │   ├── BudgetSelection.jsx # Budget list and creation
│   │   └── ShareBudgetModal.jsx # Budget sharing interface
│   ├── contexts/
│   │   └── FirebaseContext.jsx # Firebase state management
│   ├── firebase.js            # Firebase configuration
│   ├── App.jsx               # Root component
│   ├── AppWrapper.jsx        # Authentication wrapper
│   ├── main.jsx              # Entry point
│   └── index.css             # Tailwind CSS imports
├── public/
├── .env.example              # Environment variables template
├── .gitignore
├── package.json
├── README.md
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## 🔥 Firebase Integration

### Database Structure
```
firestore/
├── users/{userId}/
│   ├── email: string
│   ├── name: string
│   ├── createdAt: timestamp
│   └── budgets: array[budgetId]
└── budgets/{budgetId}/
    ├── info/
    │   ├── name: string
    │   ├── code: string (6 chars)
    │   ├── createdBy: userId
    │   ├── members: array[userId]
    │   └── createdAt: timestamp
    ├── expenses: array
    ├── people: array
    ├── categories: array
    ├── salaries: array
    ├── settings: object
    ├── lastTransfers: object
    └── staticAmounts: array
```

### Security Rules (to be configured in Firebase Console)
```javascript
// Firestore Security Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Budget access restricted to members
    match /budgets/{budgetId} {
      allow read, write: if request.auth != null && 
        request.auth.uid in resource.data.info.members;
      allow create: if request.auth != null;
    }
  }
}
```

## 🎨 Key Features Explained

### Smart Bill Allocation
The bill allocation calculator tracks how much money should be in your bills account based on:
- Days since each bill was last paid
- Individual payment frequencies
- Static amounts for buffers
- Per-person allocation based on ownership

### Flexible Viewing Options
All monetary amounts are automatically converted based on your selected view period, making it easy to understand your finances whether you think in weekly, monthly, or yearly terms.

### Multi-Person Support
Perfect for couples or roommates sharing expenses:
- Track individual income sources
- Assign expenses to specific people
- Calculate fair bill splits
- Customize colors for visual distinction

### Category Management
- Create unlimited custom categories
- Assign unique colors for easy identification
- Edit categories inline without losing data
- Track expense counts per category

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- Built with React + Vite template
- Icons provided by Lucide React
- Charts powered by Recharts
- Styling with Tailwind CSS

---

Made with ❤️ by [davmos15](https://github.com/davmos15)