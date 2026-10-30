package com.rose.bizikimiz.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import com.rose.bizikimiz.R;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONObject;

/**
 * Biz İkimiz ana ekran widget'ı: "N gündür birlikteyiz", iki ad, buluşma geri sayımı.
 * Veri: web (js/core/mobil.js widgetGuncelle) → BizWidgetPlugin → SharedPreferences "BizWidget".
 * Gün sayısını burada hesaplar (gunler.js daysTogether: başlangıç günü 1. gün). Tazeleme: veri yazılınca,
 * uygulama her öne geldiğinde, gece yarısı (kesin olmayan alarm), saat/saat dilimi değişince.
 * Boyutlar: BizWidgetKucuk (2×1), BizWidgetBuyuk (4×2). Kaynaklar mobil/android-ek/res, minSdk 24.
 */
public abstract class BizWidget extends AppWidgetProvider {

    static final String TAZELE = "com.rose.bizikimiz.widget.TAZELE";

    private static final String ETIKET = "BizWidget";
    private static final String DEPO = "BizWidget";
    private static final String ANAHTAR = "veri";
    private static final long GUN_MS = 86400000L;
    private static final long PENCERE_MS = 15 * 60 * 1000L; // Android 12+ 10 dk altını zaten uzatır
    private static final Locale TR = Locale.forLanguageTag("tr-TR");

    // Yazı boyutları (sp): yerleşimdeki değerlerle aynı; boş durumda ad daha küçük yazılır.
    private static final float SAYI_BUYUK = 44f;
    private static final float SAYI_KUCUK = 30f;
    private static final float AD_BUYUK = 28f;
    private static final float AD_KUCUK = 20f;

    @Override
    public void onUpdate(Context context, AppWidgetManager yonetici, int[] kimlikler) {
        hepsiniGuncelle(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String eylem = intent.getAction();
        if (TAZELE.equals(eylem) || Intent.ACTION_TIME_CHANGED.equals(eylem) || Intent.ACTION_TIMEZONE_CHANGED.equals(eylem)) {
            hepsiniGuncelle(context);
        }
    }

    @Override
    public void onDisabled(Context context) {
        hepsiniGuncelle(context); // hiç widget kalmadıysa gece yarısı alarmını kaldırır
    }

    /** Web'den gelen kaydı saklar (BizWidgetPlugin). */
    static void veriYaz(Context context, String json) {
        context.getApplicationContext().getSharedPreferences(DEPO, Context.MODE_PRIVATE).edit().putString(ANAHTAR, json).apply();
    }

    /** İki boyuttaki bütün widget'ları yeniden çizer; gece yarısı alarmını kurar (widget yoksa kaldırır). */
    static void hepsiniGuncelle(Context context) {
        Context uyg = context.getApplicationContext();
        try {
            AppWidgetManager yonetici = AppWidgetManager.getInstance(uyg);
            if (yonetici == null) return; // widget desteği olmayan cihaz
            int[] kucuk = kimlikler(yonetici, uyg, BizWidgetKucuk.class);
            int[] buyuk = kimlikler(yonetici, uyg, BizWidgetBuyuk.class);
            if (kucuk.length + buyuk.length == 0) {
                alarmIptal(uyg);
                return;
            }
            Durum d = durum(uyg, new GregorianCalendar());
            if (kucuk.length > 0) yonetici.updateAppWidget(kucuk, ikiYon(uyg, d, false));
            if (buyuk.length > 0) yonetici.updateAppWidget(buyuk, ikiYon(uyg, d, true));
            geceYarisiKur(uyg);
        } catch (RuntimeException e) {
            Log.w(ETIKET, "widget güncellenemedi", e);
        }
    }

    private static int[] kimlikler(AppWidgetManager yonetici, Context c, Class<?> sinif) {
        int[] k = yonetici.getAppWidgetIds(new ComponentName(c, sinif));
        return k != null ? k : new int[0];
    }

    // ---------- Veri → durum (saf hesap) ----------

    /** Çizime hazır durum. gun 0: sayaç yok ya da başlamadı. bulusmaGun -1: buluşma yok ya da geçti. */
    static final class Durum {
        String adlar = "";
        boolean baslangicVar = false;
        long gun = 0;
        long bulusmaGun = -1;
    }

    static Durum durum(Context c, Calendar bugun) {
        Durum d = new Durum();
        String ham = c.getSharedPreferences(DEPO, Context.MODE_PRIVATE).getString(ANAHTAR, null);
        if (ham == null) return d;
        try {
            JSONObject o = new JSONObject(ham);
            long bugunNo = gunNo(bugun);
            d.adlar = o.isNull("adlar") ? "" : o.optString("adlar", "").trim();
            long bas = o.isNull("baslangic") ? YOK : gunNo(o.optString("baslangic", ""));
            if (bas != YOK) {
                d.baslangicVar = true;
                long n = bugunNo - bas;
                d.gun = n < 0 ? 0 : n + 1;
            }
            if (!o.isNull("bulusma")) {
                GregorianCalendar an = new GregorianCalendar(); // cihazın saat dilimi: yerel gün
                an.setTimeInMillis(o.getLong("bulusma"));
                long kalan = gunNo(an) - bugunNo;
                if (kalan >= 0) d.bulusmaGun = kalan;
            }
        } catch (Exception e) {
            Log.w(ETIKET, "widget verisi okunamadı", e);
        }
        return d;
    }

    private static final long YOK = Long.MIN_VALUE;

    /** Takvim günü (yerel) → 1970-01-01'den gün sayısı. */
    static long gunNo(Calendar c) {
        return gunNo(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    /** 'YYYY-MM-DD' → gün sayısı; geçersizse YOK. */
    static long gunNo(String s) {
        if (s == null || !s.matches("\\d{4}-\\d{2}-\\d{2}")) return YOK;
        try {
            return gunNo(Integer.parseInt(s.substring(0, 4)), Integer.parseInt(s.substring(5, 7)), Integer.parseInt(s.substring(8, 10)));
        } catch (IllegalArgumentException e) {
            return YOK; // 2024-02-30 gibi
        }
    }

    private static long gunNo(int yil, int ay, int gun) {
        GregorianCalendar u = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        u.setLenient(false);
        u.clear();
        u.set(yil, ay - 1, gun);
        return Math.floorDiv(u.getTimeInMillis(), GUN_MS);
    }

    // ---------- Çizim ----------

    /**
     * Yatay ekranda satırlar alçak (1 satır ~51 dp, 2 satır ~117 dp): ayrı, yan yana yerleşim.
     * RemoteViews(yatay, dikey) API 16+; birleşik nesne değiştirilemez, ikisi ayrı doldurulur.
     */
    private static RemoteViews ikiYon(Context c, Durum d, boolean buyuk) {
        return new RemoteViews(ciz(c, d, buyuk, true), ciz(c, d, buyuk, false));
    }

    static RemoteViews ciz(Context c, Durum d, boolean buyuk, boolean yatay) {
        int yerlesim = buyuk
            ? (yatay ? R.layout.biz_widget_buyuk_yatay : R.layout.biz_widget_buyuk)
            : (yatay ? R.layout.biz_widget_kucuk_yatay : R.layout.biz_widget_kucuk);
        RemoteViews v = new RemoteViews(c.getPackageName(), yerlesim);
        String baslik = c.getString(R.string.biz_widget_baslik);
        String sayi;
        String etiket;
        float boyut;
        if (d.gun > 0) {
            sayi = String.format(TR, "%,d", d.gun); // 1.234
            etiket = c.getString(R.string.biz_widget_gundur);
            boyut = buyuk ? SAYI_BUYUK : SAYI_KUCUK;
        } else {
            sayi = baslik;
            etiket = c.getString(d.baslangicVar ? R.string.biz_widget_yakinda : R.string.biz_widget_bos);
            boyut = buyuk ? AD_BUYUK : AD_KUCUK;
        }
        String bulusma = bulusmaMetni(c, d.bulusmaGun);

        // Görünüm yeniden kullanılabilir (aynı yerleşim): her alan her seferinde açıkça yazılır.
        v.setTextViewText(R.id.biz_widget_sayi, sayi);
        v.setTextViewTextSize(R.id.biz_widget_sayi, TypedValue.COMPLEX_UNIT_SP, boyut);
        v.setTextViewText(R.id.biz_widget_etiket, etiket);
        if (buyuk) {
            v.setTextViewText(R.id.biz_widget_adlar, d.adlar);
            v.setViewVisibility(R.id.biz_widget_adlar_satir, d.adlar.isEmpty() ? View.GONE : View.VISIBLE);
            v.setTextViewText(R.id.biz_widget_bulusma, bulusma == null ? "" : bulusma);
            v.setViewVisibility(R.id.biz_widget_bulusma, bulusma == null ? View.GONE : View.VISIBLE);
        }

        // Ekran okuyucu tek parça okur: "Ömer & Gül. 1.234 gündür birlikteyiz. Buluşmaya 3 gün."
        StringBuilder aciklama = new StringBuilder(d.adlar.isEmpty() ? baslik : d.adlar).append(". ");
        aciklama.append(d.gun > 0 ? sayi + " " + etiket : etiket).append('.');
        if (bulusma != null) aciklama.append(' ').append(bulusma).append('.');
        v.setContentDescription(android.R.id.background, aciklama.toString());

        PendingIntent ac = acmaNiyeti(c);
        if (ac != null) v.setOnClickPendingIntent(android.R.id.background, ac);
        return v;
    }

    static String bulusmaMetni(Context c, long kalan) {
        if (kalan < 0) return null;
        if (kalan == 0) return c.getString(R.string.biz_widget_bulusma_bugun);
        if (kalan == 1) return c.getString(R.string.biz_widget_bulusma_yarin);
        return c.getString(R.string.biz_widget_bulusmaya, String.format(TR, "%,d", kalan));
    }

    /** Dokununca uygulamayı açar (başlatıcı etkinliği; MainActivity singleTask). */
    private static PendingIntent acmaNiyeti(Context c) {
        Intent ac = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (ac == null) return null;
        ac.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return PendingIntent.getActivity(c, 0, ac, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // ---------- Gece yarısı tazelemesi ----------

    private static PendingIntent tazeleNiyeti(Context c) {
        Intent i = new Intent(c, BizWidgetKucuk.class).setAction(TAZELE);
        return PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /**
     * Bir sonraki yerel gece yarısı (+5 sn) için kesin olmayan alarm. SCHEDULE_EXACT_ALARM gerekmez.
     * RTC: cihazı uyandırmaz; ekran açılınca gelir (widget o an görünür olur). Aynı niyet önceki alarmın yerine geçer.
     */
    private static void geceYarisiKur(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        GregorianCalendar t = new GregorianCalendar();
        t.add(Calendar.DAY_OF_MONTH, 1);
        t.set(Calendar.HOUR_OF_DAY, 0);
        t.set(Calendar.MINUTE, 0);
        t.set(Calendar.SECOND, 5);
        t.set(Calendar.MILLISECOND, 0);
        am.setWindow(AlarmManager.RTC, t.getTimeInMillis(), PENCERE_MS, tazeleNiyeti(c));
    }

    private static void alarmIptal(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(tazeleNiyeti(c));
    }
}
