# Firebase Debug Instructions

## Issue: "Failed to create budget" error

### Steps to fix:

1. **Check Browser Console**
   - Open browser developer tools (F12)
   - Look for any Firebase errors in the console
   - Common errors:
     - "Missing or insufficient permissions"
     - "Firebase app not initialized"
     - Network errors

2. **Update Firestore Security Rules**
   - Go to Firebase Console: https://console.firebase.google.com
   - Select your project "budget-tracker-7fad5"
   - Navigate to Firestore Database → Rules
   - Replace the rules with the content from `firestore.rules` file:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow users to read and write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Allow authenticated users to create budgets
    match /budgets/{budgetId} {
      allow read: if request.auth != null && 
        request.auth.uid in resource.data.info.members;
      
      allow create: if request.auth != null && 
        request.auth.uid == request.resource.data.info.createdBy &&
        request.auth.uid in request.resource.data.info.members;
      
      allow update: if request.auth != null && 
        request.auth.uid in resource.data.info.members;
      
      allow delete: if request.auth != null && 
        request.auth.uid == resource.data.info.createdBy;
    }
    
    // Allow searching budgets by code (for joining)
    match /budgets/{budgetId} {
      allow read: if request.auth != null;
    }
  }
}
```

3. **Enable Firestore in Firebase Console**
   - Make sure Firestore is enabled in your Firebase project
   - Go to Firestore Database in Firebase Console
   - If not created, click "Create Database"
   - Choose "Start in production mode"
   - Select a location (preferably us-central1)

4. **Check Authentication**
   - Ensure you're properly logged in before creating a budget
   - Check if the user document is created in Firestore after signup

5. **Test the fix**
   - Refresh the app
   - Try creating a budget again
   - The budget should be created with a 6-character code
   - You can find the code in the budget selection screen or by clicking "Share" in the budget

## Budget Code Location
Once a budget is created, you can find the code:
1. On the Budget Selection screen - displayed on each budget card
2. Inside any budget - click the "Share" button in the top right
3. The code will be displayed in large text and can be copied

## Sharing a Budget
1. Share the 6-character code with others
2. They should click "Join Existing Budget" on their budget selection screen
3. Enter the code and they'll have access to the shared budget
4. All changes sync in real-time between users