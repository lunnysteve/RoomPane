package io.github.lunnysteve.homedisplay;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;

public class SettingsActivity extends Activity {
    private EditText address;private TextView status,qrUrl;private ImageView qrImage;private CheckBox auto;private Spinner screens;private String[] endpoints={};private ApkInstaller installer;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        installer=new ApkInstaller(this);
        LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(48,32,48,32);layout.setFocusableInTouchMode(true);
        TextView title=new TextView(this);title.setText("Roompane · choose your screen");title.setTextSize(26);layout.addView(title);
        address=new EditText(this);address.setSingleLine(true);address.setHint("http://raspberrypi.local:3000/screen/living-room");address.setText(DisplayWebView.url(this));layout.addView(address);
        Button discover=new Button(this);discover.setText("Load screens from this server");discover.setOnClickListener(v->loadScreens());layout.addView(discover);
        screens=new Spinner(this);layout.addView(screens);
        screens.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?> parent){} public void onItemSelected(AdapterView<?> parent,android.view.View view,int position,long id){if(position<endpoints.length)address.setText(endpoints[position]);}});
        TextView qrTitle=new TextView(this);qrTitle.setText("Edit this display from your phone");qrTitle.setTextSize(21);layout.addView(qrTitle);
        qrImage=new ImageView(this);qrImage.setPadding(8,8,8,8);qrImage.setBackgroundColor(0xffffffff);qrImage.setContentDescription("QR code for Roompane Studio");layout.addView(qrImage,new LinearLayout.LayoutParams(336,336));
        qrUrl=new TextView(this);qrUrl.setTextSize(16);layout.addView(qrUrl);
        TextView qrHint=new TextView(this);qrHint.setText("Scan the code on your phone, then sign in to Studio with your Pi admin password.");layout.addView(qrHint);
        address.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){} public void onTextChanged(CharSequence s,int start,int before,int count){showQr();} public void afterTextChanged(Editable value){} });
        showQr();
        auto=new CheckBox(this);auto.setText("Open this screen automatically when the app launches");auto.setChecked(getSharedPreferences("display",0).getBoolean("auto",true));layout.addView(auto);
        Button save=new Button(this);save.setText("Save and view");save.setOnClickListener(v->{String url=address.getText().toString().trim();Uri uri=Uri.parse(url);if(!valid(uri)){status.setText("Enter a complete HTTP or HTTPS screen URL.");return;}getSharedPreferences("display",0).edit().putString("url",url).putBoolean("auto",auto.isChecked()).apply();setResult(RESULT_OK);finish();});layout.addView(save);
        Button saver=new Button(this);saver.setText("Screensaver setup");saver.setOnClickListener(v->new AlertDialog.Builder(this).setTitle("Choose Roompane as screensaver").setMessage("Open your TV settings and find Screen saver. Select Roompane if your TV allows third-party screensavers.").setPositiveButton("Open TV settings",(dialog,which)->{try{startActivity(new Intent(Settings.ACTION_SETTINGS));}catch(RuntimeException error){status.setText("This TV does not expose system settings from apps.");}}).setNegativeButton("Close",null).show());layout.addView(saver);
        Button updates=new Button(this);updates.setText("Check for app updates");updates.setOnClickListener(v->{status.setText("Checking GitHub releases...");UpdateChecker.check(this, installer, true, message->status.setText(message));});layout.addView(updates);
        status=new TextView(this);status.setText("Create screens in the web admin, then select their endpoint here. Screensaver selection is controlled by the TV.");status.setTextSize(17);layout.addView(status);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(0xff142133);scroll.addView(layout);setContentView(scroll);discover.requestFocus();
    }
    private void showQr(){
        String url=StudioQr.adminUrl(address.getText().toString());
        if(url==null){qrImage.setVisibility(View.GONE);qrUrl.setText("Enter your Pi screen address to show its Studio QR code.");return;}
        try{qrImage.setImageBitmap(StudioQr.image(url));qrImage.setVisibility(View.VISIBLE);qrUrl.setText(url);}
        catch(Exception error){qrImage.setVisibility(View.GONE);qrUrl.setText("Could not create the Studio QR code.");}
    }
    @Override protected void onResume(){super.onResume();installer.resume();}
    @Override protected void onDestroy(){installer.close();super.onDestroy();}
    private boolean valid(Uri uri){return ("http".equals(uri.getScheme())||"https".equals(uri.getScheme()))&&uri.getHost()!=null&&uri.getUserInfo()==null;}
    private void loadScreens(){Uri uri=Uri.parse(address.getText().toString().trim());if(!valid(uri)){status.setText("Enter this server’s HTTP(S) URL first.");return;}String base=uri.getScheme()+"://"+uri.getAuthority();status.setText("Loading screens…");new Thread(()->{HttpURLConnection connection=null;try{connection=(HttpURLConnection)new URL(base+"/api/screens").openConnection();connection.setConnectTimeout(7000);connection.setReadTimeout(7000);connection.setInstanceFollowRedirects(false);if(connection.getResponseCode()!=200)throw new Exception();ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(java.io.InputStream in=connection.getInputStream()){byte[] buffer=new byte[4096];int count;while((count=in.read(buffer))!=-1){if(bytes.size()+count>65536)throw new Exception();bytes.write(buffer,0,count);}}JSONArray list=new JSONObject(bytes.toString("UTF-8")).getJSONArray("screens");String[] labels=new String[list.length()+1],urls=new String[list.length()+1];labels[0]="Default display";urls[0]=base+"/";for(int i=0;i<list.length();i++){JSONObject item=list.getJSONObject(i);labels[i+1]=item.getString("name");urls[i+1]=base+item.getString("path");}runOnUiThread(()->{endpoints=urls;screens.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,labels));status.setText("Choose a screen, then Save and view.");});}catch(Exception error){runOnUiThread(()->status.setText("Could not reach this Roompane server. Check the URL and network."));}finally{if(connection!=null)connection.disconnect();}}).start();}
}
