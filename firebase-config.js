// LabScan — configuración pública de Firebase.
// La seguridad real está en Firebase Authentication + Realtime Database Rules.

export const firebaseConfig = {
  apiKey: "AIzaSyAtTfgfsr4tGYWt27a7YeITyRizOzVksRw",
  authDomain: "lab-scan-dde41.firebaseapp.com",
  databaseURL: "https://lab-scan-dde41-default-rtdb.firebaseio.com",
  projectId: "lab-scan-dde41",
  storageBucket: "lab-scan-dde41.firebasestorage.app",
  messagingSenderId: "814024854488",
  appId: "1:814024854488:web:5d6e5f7f55cf187bdf00ad"
};

export const labScanConfig = {
  appUrl: "https://rourog.github.io/labscan/",
  sessionMinutes: 30
};

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.databaseURL &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}
