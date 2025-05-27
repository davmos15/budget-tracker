#!/usr/bin/env node

/**
 * Environment Setup Verification Script
 * Run this to verify your environment variables are properly configured
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Environment Setup...\n');

// Check for required files
const requiredFiles = [
  '.env.example',
  '.env.local',
  'src/firebase.js'
];

const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MEASUREMENT_ID'
];

let allGood = true;

// Check files exist
console.log('📁 Checking required files:');
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - Missing!`);
    allGood = false;
  }
});

// Check .env.local has all variables
console.log('\n🔑 Checking environment variables in .env.local:');
if (fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  requiredEnvVars.forEach(varName => {
    if (envContent.includes(`${varName}=`) && !envContent.includes(`${varName}=your_`)) {
      console.log(`  ✅ ${varName}`);
    } else {
      console.log(`  ❌ ${varName} - Missing or not set!`);
      allGood = false;
    }
  });
} else {
  console.log('  ❌ .env.local file not found!');
  allGood = false;
}

// Check .gitignore contains .env.local
console.log('\n🙈 Checking .gitignore:');
if (fs.existsSync('.gitignore')) {
  const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
  if (gitignoreContent.includes('.env.local')) {
    console.log('  ✅ .env.local is in .gitignore');
  } else {
    console.log('  ❌ .env.local not found in .gitignore');
    allGood = false;
  }
} else {
  console.log('  ❌ .gitignore file not found!');
  allGood = false;
}

// Check firebase.js uses import.meta.env
console.log('\n🔥 Checking firebase.js configuration:');
if (fs.existsSync('src/firebase.js')) {
  const firebaseContent = fs.readFileSync('src/firebase.js', 'utf8');
  if (firebaseContent.includes('import.meta.env.VITE_FIREBASE')) {
    console.log('  ✅ Uses Vite environment variables');
  } else {
    console.log('  ❌ Still uses hardcoded values or wrong env format!');
    allGood = false;
  }
  
  if (firebaseContent.includes('requiredEnvVars')) {
    console.log('  ✅ Has environment validation');
  } else {
    console.log('  ❌ Missing environment validation');
    allGood = false;
  }
} else {
  console.log('  ❌ src/firebase.js not found!');
  allGood = false;
}

console.log('\n' + '='.repeat(50));
if (allGood) {
  console.log('🎉 All checks passed! Your app is ready for deployment.');
  console.log('\nNext steps:');
  console.log('1. Test locally: npm run dev');
  console.log('2. Test build: npm run build');
  console.log('3. Deploy to Vercel with the environment variables from DEPLOYMENT.md');
} else {
  console.log('❌ Some issues found. Please fix them before deploying.');
  console.log('Refer to DEPLOYMENT.md for detailed instructions.');
}
console.log('='.repeat(50));