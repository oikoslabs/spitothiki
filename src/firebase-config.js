// Optional sync with Firebase. Leave `firebaseConfig` as null to keep the app 100% local.
// To enable: paste the config from Firebase console → Project settings → Your apps → Web app.
// These values are not secrets (they identify the project); access is protected by the
// Firestore security rules in firestore.rules.
export const firebaseConfig = null;
// Example:
// export const firebaseConfig = {
//   apiKey: 'AIza...',
//   authDomain: 'your-project.firebaseapp.com',
//   projectId: 'your-project',
//   storageBucket: 'your-project.firebasestorage.app',
//   messagingSenderId: '1234567890',
//   appId: '1:1234567890:web:abc123'
// };

// Sign-in methods shown in Settings (enable the same ones in Firebase console → Authentication).
export const authProviders = ['google', 'password'];
