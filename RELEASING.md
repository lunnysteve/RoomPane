# Releases and updates

Versions use `MAJOR.MINOR.PATCH`, with matching Git tags such as `v1.1.0`.
The GitHub release workflow runs server tests, builds the signed Android TV APK,
and publishes the app archive, APK and `SHA256SUMS` on a tag push.

To prepare a release, update `package.json` and its lock file with
`npm version VERSION --no-git-tag-version`. The Android version name and
monotonically increasing version code are derived from that package version.
Commit the changes and push the matching tag. Release package versions must
match the tag; the updater rejects mismatches, older versions and prereleases.

## Pi update flow

Studio → **Screens & updates** displays the installed version, checks the latest
GitHub release, links release notes and shows **Update available** when applicable.
Updates require the standalone installer and its supplied root update helper.
The root service independently retrieves the configured repository's latest
release, verifies its SHA-256 checksum, rejects unsafe archive members, installs
dependencies without package scripts, and restarts the app. A failed health check
restores the previous application. Old application folders are retained under
`/opt/home-display/updates` for manual rollback.

Runtime settings, screens, plugins, fonts and uploads stay in
`/var/lib/home-display`; updates replace application files. The update helper
itself is installed by `install.sh` or `pi/update-studio.sh`.

## Private GitHub repository

Create a fine-grained GitHub personal access token restricted to **home-display**,
with repository **Contents: read-only** permission. Save it under **Screens &
updates → Private repository access token**. The token is stored separately in
the runtime directory with mode 600 and is never returned by the API. An empty
token clears the saved value. Alternatively, administrators can configure
`HOME_DISPLAY_GITHUB_TOKEN` in the root-owned environment file. Keep admin access
on a trusted LAN or use HTTPS.

Repository selection defaults to `lunnysteve/home-display`; forks set
`HOME_DISPLAY_UPDATE_REPO=owner/repo` in `/etc/home-display/environment`.

## Android TV signing

Keep the local TV signing key backed up. GitHub Actions needs secrets
`ANDROID_TV_KEYSTORE` (base64-encoded keystore) and
`ANDROID_TV_STORE_PASSWORD`. The signing alias is `home-display`. Builds use the
same key so subsequent APKs can replace an installed version. Keys and passwords
are excluded from the repository. Android APK installation remains a device action;
the Pi update button updates the server application, not TV installations.
