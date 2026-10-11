package io.github.lunnysteve.homedisplay;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

final class ApkInstaller {
    private static final String DOWNLOAD_ID = "apk_download_id";
    private final Activity activity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private AlertDialog dialog;
    private long shownId = -1;
    private int generation;

    ApkInstaller(Activity activity) { this.activity = activity; }

    boolean hasPending() { return activity.getSharedPreferences("display", 0).getLong(DOWNLOAD_ID, -1) >= 0; }

    void download(String url, String version) {
        Uri source = Uri.parse(url);
        String expectedPath = "/lunnysteve/home-display/releases/download/v" + version + "/home-display-tv-v" + version + ".apk";
        if (!"https".equals(source.getScheme()) || !"github.com".equals(source.getHost()) || !expectedPath.equals(source.getPath())) {
            showError("Invalid update download address.");
            return;
        }
        try {
            long previous = activity.getSharedPreferences("display", 0).getLong(DOWNLOAD_ID, -1);
            if (previous >= 0) { manager().remove(previous); clear(previous); }
            DownloadManager.Request request = new DownloadManager.Request(source)
                .setTitle("Home Display TV " + version)
                .setDescription("Downloading the signed update")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            long id = manager().enqueue(request);
            activity.getSharedPreferences("display", 0).edit().putLong(DOWNLOAD_ID, id).apply();
            showProgress(id);
        } catch (RuntimeException error) {
            showError("Could not start the APK download. Check that Download Manager is enabled on this TV.");
        }
    }

    void resume() {
        long id = activity.getSharedPreferences("display", 0).getLong(DOWNLOAD_ID, -1);
        if (id >= 0 && (shownId != id || dialog == null || !dialog.isShowing())) showProgress(id);
    }

    void close() {
        generation++;
        handler.removeCallbacksAndMessages(null);
        if (dialog != null) dialog.dismiss();
        dialog = null;
    }

    private DownloadManager manager() { return (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE); }

    private void showProgress(long id) {
        if (dialog != null) dialog.dismiss();
        shownId = id;
        int currentGeneration = ++generation;
        dialog = new AlertDialog.Builder(activity)
            .setTitle("Downloading Home Display update")
            .setMessage("Starting download…")
            .setNegativeButton("Cancel", (box, which) -> { manager().remove(id); clear(id); }).create();
        dialog.show();
        poll(id, currentGeneration);
    }

    private void poll(long id, int currentGeneration) {
        if (generation != currentGeneration || activity.isFinishing() || activity.isDestroyed()) return;
        try (Cursor cursor = manager().query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor == null || !cursor.moveToFirst()) throw new IllegalStateException("Download is no longer available.");
            int state = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (state == DownloadManager.STATUS_SUCCESSFUL) {
                Uri apk = manager().getUriForDownloadedFile(id);
                if (apk == null) throw new IllegalStateException("Downloaded APK could not be opened.");
                clear(id);
                dialog.dismiss();
                Intent install = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                install.setDataAndType(apk, "application/vnd.android.package-archive");
                install.setClipData(ClipData.newRawUri("Home Display update", apk));
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                activity.startActivity(install);
                return;
            }
            if (state == DownloadManager.STATUS_FAILED) throw new IllegalStateException("APK download failed. Check the TV's internet connection and free space.");
            long done = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            dialog.setMessage(total > 0 ? "Downloaded " + (done * 100 / total) + "%" : "Downloading APK…");
            handler.postDelayed(() -> poll(id, currentGeneration), 1000);
        } catch (RuntimeException error) {
            clear(id);
            if (dialog != null) dialog.dismiss();
            showError(error.getMessage() == null ? "Could not install the downloaded APK." : error.getMessage());
        }
    }

    private void clear(long id) {
        if (activity.getSharedPreferences("display", 0).getLong(DOWNLOAD_ID, -1) == id)
            activity.getSharedPreferences("display", 0).edit().remove(DOWNLOAD_ID).apply();
        if (shownId == id) { shownId = -1; generation++; }
    }

    private void showError(String message) {
        if (!activity.isFinishing() && !activity.isDestroyed())
            new AlertDialog.Builder(activity).setMessage(message).setPositiveButton("OK", null).show();
    }
}
