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
    private ApkInstaller installer;
    private boolean menuRequested;
    private boolean viewAfterSettings;
    @Override public void onCreate(Bundle state) { super.onCreate(state); installer=new ApkInstaller(this); getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); if(!installer.hasPending())UpdateChecker.check(this, installer, false, null); }
    @Override public void onResume() {
        super.onResume();
        String url = DisplayWebView.url(this);
        if (viewAfterSettings && !url.isEmpty()) {viewAfterSettings=false;showDisplay(url);}
        else if (!menuRequested && !url.isEmpty() && getSharedPreferences("display",0).getBoolean("auto",true)) showDisplay(url); else showMenu();
        installer.resume();
    }
    private void showMenu() {
        destroyDisplay();
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(48,40,48,40);
        TextView title=new TextView(this);title.setText("Home Display TV");title.setTextSize(30);layout.addView(title);
        Button open=new Button(this);open.setText("View saved screen");open.setEnabled(!DisplayWebView.url(this).isEmpty());open.setOnClickListener(v->{menuRequested=false;showDisplay(DisplayWebView.url(this));});layout.addView(open);
        Button setup=new Button(this);setup.setText("Choose screen / settings");setup.setOnClickListener(v->{menuRequested=true;startActivityForResult(new Intent(this,SettingsActivity.class),1);});layout.addView(setup);
        TextView hint=new TextView(this);hint.setText("Press Back or the remote Menu button from the display to return here. Configure Home Display as a screensaver in your TV system settings.");hint.setTextSize(18);layout.addView(hint);
        setContentView(layout);setup.requestFocus();
    }
    private void showDisplay(String url) {
        destroyDisplay();
        try { display=DisplayWebView.create(this,url);setContentView(display);getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY); }
        catch (RuntimeException error) { showMenu(); }
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);if(requestCode==1&&resultCode==RESULT_OK){menuRequested=false;viewAfterSettings=true;}}
    @Override public boolean onKeyDown(int code,KeyEvent event) { if (display!=null&&(code==KeyEvent.KEYCODE_BACK||code==KeyEvent.KEYCODE_MENU)) {menuRequested=true;showMenu();return true;}return super.onKeyDown(code,event); }
    private void destroyDisplay(){if(display!=null){display.stopLoading();display.destroy();display=null;}getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);}
    @Override protected void onDestroy(){installer.close();destroyDisplay();super.onDestroy();}
}
