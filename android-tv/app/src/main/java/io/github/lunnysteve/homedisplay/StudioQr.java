package io.github.lunnysteve.homedisplay;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

final class StudioQr {
    static String adminUrl(String screenUrl) {
        Uri uri = Uri.parse(screenUrl.trim());
        if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || uri.getHost() == null || uri.getUserInfo() != null) return null;
        return uri.getScheme() + "://" + uri.getAuthority() + "/admin";
    }

    static Bitmap image(String url) throws Exception {
        BitMatrix bits = new QRCodeWriter().encode(url, BarcodeFormat.QR_CODE, 320, 320);
        Bitmap bitmap = Bitmap.createBitmap(bits.getWidth(), bits.getHeight(), Bitmap.Config.ARGB_8888);
        for (int y = 0; y < bits.getHeight(); y++)
            for (int x = 0; x < bits.getWidth(); x++)
                bitmap.setPixel(x, y, bits.get(x, y) ? Color.BLACK : Color.WHITE);
        return bitmap;
    }
}
