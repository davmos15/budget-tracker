# Production Deployment Guide

## Environment Variables Setup ✅

Your Firebase-integrated budget tracker is now configured with environment variables and ready for production deployment.

## 📋 Pre-Deployment Checklist

- [x] Firebase configuration moved to environment variables
- [x] .env.local created for local development 
- [x] .env.example created as template
- [x] .gitignore includes .env.local (no secrets in git)
- [x] src/firebase.js updated with env vars and error handling
- [x] Local development server tested ✅
- [x] Production build tested ✅

## 🚀 Vercel Deployment Instructions

### Step 1: Environment Variables for Vercel

In your Vercel dashboard, go to your project settings and add these environment variables:

**Copy and paste these exact variable names and values:**

```
VITE_FIREBASE_API_KEY=AIzaSyARZAU55VjI5JvV5EjqCQ14eh-Ihjff0Jw
VITE_FIREBASE_AUTH_DOMAIN=budget-tracker-7fad5.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=budget-tracker-7fad5
VITE_FIREBASE_STORAGE_BUCKET=budget-tracker-7fad5.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=410421838706
VITE_FIREBASE_APP_ID=1:410421838706:web:bdeb739d9eff83a2e5d3eb
VITE_FIREBASE_MEASUREMENT_ID=G-Q31KQHBKZY
VITE_ENVIRONMENT=production
```

### Step 2: Deploy to Vercel

1. **Connect Repository:**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Select "budget-tracker" project

2. **Configure Build Settings:**
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. **Add Environment Variables:**
   - In project settings → Environment Variables
   - Add each variable from Step 1 above
   - Apply to: `Production`, `Preview`, and `Development`

4. **Deploy:**
   - Click "Deploy"
   - Vercel will automatically build and deploy your app

### Step 3: Firebase Security Configuration

Update your Firebase Console settings:

1. **Authentication:**
   - Go to Firebase Console → Authentication → Settings
   - Add your Vercel domain to authorized domains:
     - `your-app-name.vercel.app`
     - `your-custom-domain.com` (if using custom domain)

2. **Firestore Security Rules:**
   - Ensure you've applied the security rules from `firestore.rules`
   - Test the rules with Firebase Rules Simulator

## 🧪 Testing Instructions

### Local Testing

1. **Test environment variables are working:**
   ```bash
   # Stop the dev server if running, then start it again
   npm run dev
   ```
   - Check browser console for: "Firebase initialized with project: budget-tracker-7fad5"
   - Check browser console for: "Environment: development"

2. **Test production build:**
   ```bash
   npm run build
   npm run preview
   ```
   - App should work identically to dev mode

3. **Test error handling:**
   ```bash
   # Temporarily rename .env.local to .env.local.backup
   mv .env.local .env.local.backup
   npm run dev
   ```
   - Should show clear error about missing environment variables
   - Restore: `mv .env.local.backup .env.local`

4. **Run verification script:**
   ```bash
   node verify-env-setup.cjs
   ```
   - Should show all ✅ checks passed

### Production Testing

After deploying to Vercel:

1. **Verify Firebase connection:**
   - Open browser dev tools → Console
   - Should see: "Firebase initialized with project: budget-tracker-7fad5"
   - Should see: "Environment: production"

2. **Test core functionality:**
   - [ ] User registration/login
   - [ ] Budget creation and sharing
   - [ ] Real-time data sync
   - [ ] All main features work

## 🔐 Security Notes

- ✅ No hardcoded secrets in source code
- ✅ Environment variables properly configured
- ✅ .env.local excluded from git
- ✅ Firebase API key is safe to expose (it's not a secret)
- ✅ Firestore security rules protect data access

## 🚨 Troubleshooting

### Common Issues:

1. **"Missing required environment variables" error:**
   - Check that all VITE_ variables are set in Vercel
   - Variable names must match exactly (case-sensitive)
   - Note: Use `VITE_` prefix for Vite, not `REACT_APP_`

2. **Firebase connection fails:**
   - Verify project ID is correct
   - Check Firebase console for any service restrictions

3. **Authentication issues:**
   - Add your domain to Firebase authorized domains
   - Check Firestore security rules are published

4. **Build fails on Vercel:**
   - Check build logs for specific errors
   - Ensure all dependencies are in package.json
   - Try building locally first: `npm run build`

5. **Blank screen with no errors:**
   - Check browser console for Firebase initialization errors
   - Verify all environment variables are set correctly
   - Run `node verify-env-setup.cjs` to check local setup

## 📱 Additional Deployment Platforms

### Netlify
```bash
# Build settings:
Build command: npm run build
Publish directory: dist

# Environment variables: (same as Vercel list above but with VITE_ prefix)
```

### GitHub Pages
```bash
# Add to package.json:
"homepage": "https://yourusername.github.io/budget-tracker",

# Install gh-pages:
npm install --save-dev gh-pages

# Add deploy script:
"deploy": "npm run build && gh-pages -d dist"
```

## ✅ Success Indicators

Your deployment is successful when:
- [ ] App loads without console errors
- [ ] Users can register/login
- [ ] Budgets can be created and shared
- [ ] Real-time sync works between users
- [ ] All features work as in local development
- [ ] Browser console shows Firebase initialization messages

---

**🎉 Your budget tracker is now production-ready!**

## 🔧 Fixed: Vite Environment Variables

**Important Note:** This guide has been updated to use the correct Vite environment variable format:
- ✅ Uses `VITE_` prefix (not `REACT_APP_`)
- ✅ Uses `import.meta.env` (not `process.env`)
- ✅ Compatible with Vite build system