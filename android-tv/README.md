# Roompane for Android TV

The settings screen displays a QR code for the selected Pi's `/admin` Studio page.
Scan it with a phone on the same network and sign in to edit the display. App
updates download inside Roompane and then open Android's package installer;
the TV may ask once to allow installs from this app.

The app checks public GitHub releases when opened. If a newer signed APK is
available, a prompt downloads it in the app and opens Android's installer. You can also use **Check for app
updates** in the app settings. Complete installation through the TV's installer;
upgrades must use the same signing key as the installed app.

The APK displays a screen endpoint from the Roompane server. It includes a
TV launcher entry and a DreamService screensaver. Android 6 or newer and a working
Android System WebView are required.

1. Install the APK by sideloading, then open **Roompane** on the TV.
2. Enter the server URL, such as `http://raspberrypi.local:3000`.
3. Choose **Load screens from this server**, select a profile, then save.
4. Leave automatic viewing enabled to show that screen whenever the app opens.
5. For screensaver use, select Roompane in the TV's screensaver settings.

Back or the remote Menu button returns from viewing to the native app menu.
Screensaver availability and timing are controlled by the TV firmware; some
devices do not permit third-party screensavers. The viewer remains usable on
those devices. This app does not automatically launch at device boot or act as
the TV's default launcher. Use the web admin to configure pages and layouts.

The app stores its chosen endpoint locally and retries when the server cannot
be reached. LAN HTTP is supported. HTTPS certificates must be trusted by Android;
the app does not bypass certificate verification. It does not expose a JavaScript
bridge or store admin passwords. Configure pages in the server's web interface.

## Build

Use JDK 17, Android SDK 35, and the included Gradle wrapper:

```sh
./gradlew assembleDebug
```

Release builds use `HD_TV_KEYSTORE` and `HD_TV_STORE_PASSWORD`; the signing alias
is `home-display`. Keep the same signing key for APK upgrades. The release workflow
uses matching GitHub secrets. Private keys, passwords, build output and
`local.properties` are excluded from Git.
