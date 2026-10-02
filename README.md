# Jehoo Chat

A cross-platform chat app starter for Android and iOS built with Expo React Native, TypeScript, and Firebase.

## Status

This repository is being initialized with the mobile app foundation. Authentication, Firestore-backed direct/group chats, media selection/upload, push-notification setup, and an admin area are scaffolded. Voice/video calling requires a separately configured WebRTC signaling service and a custom native development build; it is not production-ready until that service and security rules are configured.

## Requirements

- Node.js LTS and npm
- Expo-compatible Android/iOS tooling (Expo Go is limited; use a development build for native calling)
- A Firebase project with Authentication (Email/Password), Cloud Firestore, and Cloud Storage enabled
- For push notifications: EAS project setup and server-side notification delivery

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in your Firebase web app configuration.
3. In Firebase Console, enable Email/Password Authentication, create Firestore and Storage, and apply the rules in `firebase/`.
4. Start the app: `npx expo start`
5. For device builds, configure EAS: `npx eas build:configure`.

Never put service-account credentials or admin private keys in the mobile app. The admin screen relies on Firebase custom claims; set claims only from a trusted server environment.

## Features in this starter

- Email sign up / sign in
- Direct and group chat list and message thread
- Image and document selection with Firebase Storage upload
- Push token registration scaffold
- Admin-only screen gated by the `admin` custom claim
- Arabic-friendly UI and responsive mobile layout

## Important limitations

- Push delivery needs a trusted backend/Cloud Function to send notifications; client token registration alone does not send notifications.
- Voice/video calling needs a signaling server, STUN/TURN configuration, native permissions, and a custom development build. Do not treat the call UI as a working calling service until these are configured and tested.
- Review and test Firestore/Storage rules before production. Add abuse reporting, rate limits, retention policies, privacy policy, and account deletion before public launch.
