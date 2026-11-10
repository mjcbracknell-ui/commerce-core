# Build APK
npm install
npx expo prebuild
eas build --platform android --profile production --local
# Output: build-*.apk - install on Android, login with admin@demo.com
