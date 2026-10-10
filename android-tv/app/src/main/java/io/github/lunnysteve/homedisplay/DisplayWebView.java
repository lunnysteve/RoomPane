package io.github.lunnysteve.homedisplay;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;

final class DisplayWebView {
    static WebView create(Context context, String url) {
        WebView view = new WebView(context);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        view.setBackgroundColor(0xff000000);
        Uri origin = Uri.parse(url);
        view.setWebViewClient(new WebViewClient() {
            private final Handler handler = new Handler();
            @Override public boolean shouldOverrideUrlLoading(WebView web, WebResourceRequest request) {
                Uri target = request.getUrl();
                return !origin.getScheme().equals(target.getScheme()) || !origin.getAuthority().equals(target.getAuthority());
            }
            @Override public void onReceivedError(WebView web, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) handler.postDelayed(() -> { if (web.getParent() != null) web.loadUrl(url); }, 15000);
            }
        });
        view.loadUrl(url);
        return view;
    }
    static String url(Context context) { return context.getSharedPreferences("display",0).getString("url",""); }
}
