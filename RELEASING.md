# Releases and updates

Use `MAJOR.MINOR.PATCH` versions and matching tags such as `v1.3.2`. Update
`package.json` and `package-lock.json` with `npm version VERSION --no-git-tag-version`,
commit the changes, then push the matching tag. The release workflow runs checks,
builds the signed Android TV APK, and publishes the app archive, APK, and
`SHA256SUMS`. Keep the same TV signing key for every release so an APK can upgrade
an installed copy.

## Pi updates

Studio's **Updates** page checks the public GitHub release and offers installation
when a newer version is available. The standalone Pi install supplies a root
update helper. It downloads the release, verifies its SHA-256 checksum, rejects
unsafe archive members, installs dependencies without package scripts, and checks
the restarted app. A failed health check restores the previous version. Runtime
settings and uploads remain in `/var/lib/home-display`.

The helper itself is installed by `install.sh` or `pi/update-studio.sh`. Existing
installations created before version 1.3.0 need a one-time run of
`sudo bash ~/home-display/pi/update-studio.sh` from a current checkout to update
the privileged helper. The helper and its system files are restored if migration
fails. Forks can set `HOME_DISPLAY_UPDATE_REPO=owner/repo` in
`/etc/home-display/environment`; the source must have public releases.

## Android TV updates

The TV app checks the latest public release when launched. If it contains a newer
APK, the app displays an update prompt that opens the download on the TV. The app's
settings screen also offers **Check for app updates**. Install the APK through the
TV's installer. The Pi's **Install update** button updates the server only.

Back up the local TV signing key. GitHub Actions needs the repository secrets
`ANDROID_TV_KEYSTORE` (base64 encoded keystore) and `ANDROID_TV_STORE_PASSWORD`.
The signing alias is `home-display`.

The `Checks` workflow runs on main and pull requests and gates release publication.
It cannot prove hardware specific screensaver behavior; test that on the target TV.
