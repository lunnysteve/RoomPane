package io.github.lunnysteve.homedisplay;
import android.service.dreams.DreamService;
import android.webkit.WebView;
import android.widget.TextView;

public class DisplayDream extends DreamService {
    private WebView display;
    @Override public void onAttachedToWindow() {
        super.onAttachedToWindow();setInteractive(false);setFullscreen(true);setScreenBright(false);
        String url=DisplayWebView.url(this);
        if(url.isEmpty()){TextView hint=new TextView(this);hint.setText("Open Home Display and choose a screen first.");hint.setTextSize(28);setContentView(hint);return;}
        try{display=DisplayWebView.create(this,url);setContentView(display);}catch(RuntimeException error){TextView hint=new TextView(this);hint.setText("This device needs an enabled Android System WebView.");setContentView(hint);}
    }
    @Override public void onDetachedFromWindow(){if(display!=null){display.stopLoading();display.destroy();display=null;}super.onDetachedFromWindow();}
}
