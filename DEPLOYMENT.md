# Deployment Guide

## Firebase Setup

1. **Create a Firebase Project**
   - Go to https://console.firebase.google.com/
   - Click "Create a project"
   - Follow the setup wizard

2. **Enable Authentication**
   - In the Firebase console, go to "Authentication"
   - Click "Get started"
   - Go to "Sign-in method" tab
   - Enable "Email/Password" provider

3. **Get Firebase Configuration**
   - In project settings, find your Firebase config object
   - Copy the config values

4. **Set Up Firestore (Optional)**
   - Go to "Firestore Database"
   - Click "Create database"
   - Choose "Start in test mode" for development

## Netlify Deployment

1. **Environment Variables**
   Set these environment variables in Netlify:
   ```
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

2. **Deploy Steps**
   - Connect your GitHub repository to Netlify
   - Set build command: `npm run build`
   - Set publish directory: `dist`
   - Deploy!

## Local Development

1. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your Firebase configuration
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```

## Authentication Flow

1. Users must sign up with email/password
2. Email verification is required before dashboard access
3. Protected routes redirect unauthenticated users to login
4. User data is stored per authenticated user

## Import Feature

The trade import script at `/import-trades.html` works with authentication:
- Automatically detects logged-in user
- Stores data scoped to that user
- Requires authentication to access