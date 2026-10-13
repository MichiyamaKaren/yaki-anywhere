package com.yaki.anywhere;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "SubtitleFiles")
public class SubtitleFilesPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        if (call.getString("text") == null) {
            call.reject("Subtitle text is required", "INVALID_TEXT");
            return;
        }
        String filename = call.getString("filename", "subtitles.ass").replaceAll("[\\\\/]", "_");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/plain");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        try {
            startActivityForResult(call, intent, "fileCreated");
        } catch (Exception error) {
            call.reject("Could not open the save dialog", "SAVE_FAILED", error);
        }
    }

    @ActivityCallback
    private void fileCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("Save cancelled", "CANCELLED");
            return;
        }
        Uri uri = data.getData();
        getBridge().execute(() -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) throw new IllegalStateException("Cannot open selected file");
                output.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
                JSObject saved = new JSObject();
                saved.put("uri", uri.toString());
                call.resolve(saved);
            } catch (Exception error) {
                call.reject("Could not save subtitles", "SAVE_FAILED", error);
            }
        });
    }
}
