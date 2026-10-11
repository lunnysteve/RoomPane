package io.github.lunnysteve.homedisplay;

import android.app.Activity;
import android.app.AlertDialog;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

final class UpdateChecker {
    private static final String REPO = "lunnysteve/home-display";
    private static final String API = "https://api.github.com/repos/" + REPO + "/releases/latest";
    interface Result { void done(String message); }

    static void check(Activity activity, ApkInstaller installer, boolean manual, Result result) {
        new Thread(() -> {
            String message = "You are up to date.";
            String version = null;
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(API).openConnection();
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "home-display-tv");
                connection.setConnectTimeout(7000);
                connection.setReadTimeout(7000);
                connection.setInstanceFollowRedirects(false);
                if (connection.getResponseCode() != 200) throw new Exception();
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream input = connection.getInputStream()) {
                    byte[] buffer = new byte[4096];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        if (bytes.size() + count > 131072) throw new Exception();
                        bytes.write(buffer, 0, count);
                    }
                }
                JSONObject release = new JSONObject(bytes.toString("UTF-8"));
                String tag = release.getString("tag_name");
                if (!tag.matches("v[0-9]+\\.[0-9]+\\.[0-9]+") || release.optBoolean("draft") || release.optBoolean("prerelease")) throw new Exception();
                String latest = tag.substring(1);
                String installed = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
                JSONArray assets = release.getJSONArray("assets");
                String apk = "home-display-tv-" + tag + ".apk";
                boolean hasApk = false;
                for (int i = 0; i < assets.length(); i++) if (apk.equals(assets.getJSONObject(i).optString("name"))) hasApk = true;
                if (newer(latest, installed) && hasApk) {
                    version = latest;
                    message = "Update available: " + latest;
                }
            } catch (Exception error) {
                message = "Could not check GitHub releases. Check your internet connection.";
            } finally {
                if (connection != null) connection.disconnect();
            }
            String finalMessage = message;
            String finalVersion = version;
            activity.runOnUiThread(() -> {
                if (activity.isFinishing() || activity.isDestroyed()) return;
                if (result != null) result.done(finalMessage);
                if (finalVersion != null) {
                    String url = "https://github.com/" + REPO + "/releases/download/v" + finalVersion + "/home-display-tv-v" + finalVersion + ".apk";
                    new AlertDialog.Builder(activity)
                        .setTitle("Roompane update available")
                        .setMessage("Version " + finalVersion + " is ready. Download it and open Android's installer?")
                        .setPositiveButton("Download and install", (dialog, which) -> installer.download(url, finalVersion))
                        .setNegativeButton("Later", null)
                        .show();
                } else if (manual) {
                    new AlertDialog.Builder(activity).setMessage(finalMessage).setPositiveButton("OK", null).show();
                }
            });
        }).start();
    }

    static boolean newer(String latest, String installed) {
        if (installed == null || !installed.matches("[0-9]+\\.[0-9]+\\.[0-9]+")) return false;
        String[] a = latest.split("\\."), b = installed.split("\\.");
        for (int i = 0; i < 3; i++) {
            int left = Integer.parseInt(a[i]), right = Integer.parseInt(b[i]);
            if (left != right) return left > right;
        }
        return false;
    }
}
