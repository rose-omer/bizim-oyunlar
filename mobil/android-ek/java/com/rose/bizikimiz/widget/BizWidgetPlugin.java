package com.rose.bizikimiz.widget;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Web → ana ekran widget'ı köprüsü. js/core/mobil.js widgetGuncelle() çağırır:
 *   Capacitor.Plugins.BizWidget.guncelle({ veri: '{"v":1,"baslangic":"2024-02-14","bulusma":1730000000000,"adlar":"Ömer & Gül"}' })
 * MainActivity kaydeder (mobil/scripts/android-hazirla.mjs yamalar). Uygulama her öne geldiğinde widget tazelenir.
 */
@CapacitorPlugin(name = "BizWidget")
public class BizWidgetPlugin extends Plugin {

    private static final int EN_UZUN = 4096;

    @PluginMethod
    public void guncelle(PluginCall call) {
        String veri = call.getString("veri");
        if (veri == null || veri.length() > EN_UZUN) {
            call.reject("Widget verisi eksik ya da çok uzun.");
            return;
        }
        try {
            new JSONObject(veri);
        } catch (JSONException e) {
            call.reject("Widget verisi JSON değil.", e);
            return;
        }
        BizWidget.veriYaz(getContext(), veri);
        BizWidget.hepsiniGuncelle(getContext());
        call.resolve();
    }

    @Override
    protected void handleOnResume() {
        // Gün değişmiş olabilir; ana iş parçacığını bekletmemek için köprünün iş kuyruğunda.
        execute(() -> BizWidget.hepsiniGuncelle(getContext()));
    }
}
