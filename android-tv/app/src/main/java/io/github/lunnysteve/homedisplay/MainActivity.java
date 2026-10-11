package io.github.lunnysteve.homedisplay;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private WebView display;
    @Override public void onCreate(Bundle state) { super.onCreate(state); getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); UpdateChecker.check(this, false, null); }
    @Override public void onResume() {
        super.onResume();
        String url = DisplayWebView.url(this);
        if (!url.isEmpty() && getSharedPreferences("display",0).getBoolean("auto",true)) showDisplay(url); else showMenu();
    }
    private void showMenu() {
        destroyDisplay();
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(48,40,48,40);
        TextView title=new TextView(this);title.setText("Home Display TV");title.setTextSize(30);layout.addView(title);
        Button open=new Button(this);open.setText("View saved screen");open.setEnabled(!DisplayWebView.url(this).isEmpty());open.setOnClickListener(v->showDisplay(DisplayWebView.url(this)));layout.addView(open);
        Button setup=new Button(this);setup.setText("Choose screen / settings");setup.setOnClickListener(v->startActivity(new Intent(this,SettingsActivity.class)));layout.addView(setup);
        TextView hint=new TextView(this);hint.setText("Press Back or the remote Menu button from the display to return here. Configure Home Display as a screensaver in your TV system settings.");hint.setTextSize(18);layout.addView(hint);
        setContentView(layout);setup.requestFocus();
    }
    private void showDisplay(String url) {
        destroyDisplay();
        try { display=DisplayWebView.create(this,url);setContentView(display);getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY); }
        catch (RuntimeException error) { showMenu(); }
    }
    @Override public boolean onKeyDown(int code,KeyEvent event) { if (display!=null&&(code==KeyEvent.KEYCODE_BACK||code==KeyEvent.KEYCODE_MENU)) {showMenu();return true;}return super.onKeyDown(code,event); }
    private void destroyDisplay(){if(display!=null){display.stopLoading();display.destroy();display=null;}getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);}
    @Override protected void onDestroy(){destroyDisplay();super.onDestroy();}
}
