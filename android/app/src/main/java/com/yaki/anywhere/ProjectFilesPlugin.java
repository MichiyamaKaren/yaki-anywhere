package com.yaki.anywhere;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.HashSet;
import java.util.Set;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "ProjectFiles")
public class ProjectFilesPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private SQLiteDatabase db;
    private File root;
    private interface Work { JSObject run() throws Exception; }
    private void execute(PluginCall call, Work work) {
        io.execute(() -> {
            try {
                if (db == null) {
                    root = new File(getContext().getNoBackupFilesDir(), "yaki-projects");
                    if (!root.isDirectory() && !root.mkdirs()) throw new IOException("Cannot create private directory");
                    db = SQLiteDatabase.openOrCreateDatabase(new File(root, "projects.db"), null);
                    db.execSQL("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, record TEXT NOT NULL)");
                    db.execSQL("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
                    db.execSQL("PRAGMA user_version=1");
                    cleanInterruptedWrites();
                }
                call.resolve(work.run());
            } catch (Exception error) {
                call.reject(error.getMessage(), error instanceof Conflict ? "CONFLICT" : "STORAGE_FAILED", error);
            }
        });
    }
    private static class Conflict extends Exception { Conflict() { super("Project was changed elsewhere. Reopen it before saving."); } }
    private String id(PluginCall call) throws Exception {
        String value = call.getString("id", "");
        if (!value.matches("[a-zA-Z0-9_-]{1,80}")) throw new IOException("Invalid project identifier");
        return value;
    }
    private File file(String name) throws Exception {
        if (!name.matches("[a-zA-Z0-9_-]+\\.(ass|video|mp4|webm|mkv|mov|m4v|avi|3gp|mpeg|ts)")) throw new IOException("Invalid private file name");
        return new File(root, name);
    }
    private void cleanInterruptedWrites() throws Exception {
        Set<String> referenced = new HashSet<>();
        try (Cursor cursor = db.rawQuery("SELECT record FROM projects", null)) {
            while (cursor.moveToNext()) {
                JSONObject record = new JSONObject(cursor.getString(0)); referenced.add(record.optString("assPath"));
                JSONObject video = record.optJSONObject("video"); if (video != null) referenced.add(video.optString("fileName"));
            }
        }
        File[] stored = root.listFiles();
        if (stored != null) for (File item : stored) {
            if (item.getName().matches("[a-fA-F0-9-]{36}\\.(ass|video|mp4|webm|mkv|mov|m4v|avi|3gp|mpeg|ts)") && !referenced.contains(item.getName())) item.delete();
        }
    }
    private JSONObject readRecord(String id) throws Exception {
        try (Cursor cursor = db.rawQuery("SELECT record FROM projects WHERE id=?", new String[] { id })) {
            return cursor.moveToFirst() ? new JSONObject(cursor.getString(0)) : null;
        }
    }
    private void put(JSONObject record) throws Exception {
        db.execSQL("INSERT OR REPLACE INTO projects(id,record) VALUES (?,?)", new Object[] { record.getString("id"), record.toString() });
    }
    private void check(JSONObject previous, int revision) throws Exception {
        if ((previous == null ? 0 : previous.getInt("revision")) != revision) throw new Conflict();
    }
    private JSObject withRecord(JSONObject record) throws Exception {
        JSObject result = new JSObject(); result.put("record", record == null ? JSONObject.NULL : record); return result;
    }
    private void erase(String name) { try { if (name != null && !name.isEmpty()) file(name).delete(); } catch (Exception ignored) {} }

    @PluginMethod public void listProjects(PluginCall call) {
        execute(call, () -> {
            JSONArray projects = new JSONArray();
            try (Cursor cursor = db.rawQuery("SELECT record FROM projects ORDER BY rowid DESC", null)) {
                while (cursor.moveToNext()) projects.put(new JSONObject(cursor.getString(0)));
            }
            JSObject result = new JSObject(); result.put("projects", projects); return result;
        });
    }
    @PluginMethod public void readProject(PluginCall call) {
        execute(call, () -> {
            JSONObject record = readRecord(id(call)); JSObject result = withRecord(record);
            if (record != null) {
                try (InputStream input = new FileInputStream(file(record.getString("assPath"))); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[16384]; int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    result.put("ass", new String(output.toByteArray(), StandardCharsets.UTF_8));
                }
            }
            return result;
        });
    }
    @PluginMethod public void saveProject(PluginCall call) {
        execute(call, () -> {
            JSONObject next = new JSONObject(call.getObject("record").toString());
            String key = next.getString("id");
            if (!key.matches("[a-zA-Z0-9_-]{1,80}")) throw new IOException("Invalid project identifier");
            int expected = call.getInt("expectedRevision", 0);
            JSONObject previous = readRecord(key); check(previous, expected);
            String staged = null;
            if (previous != null && previous.optString("assHash").equals(next.optString("assHash"))) next.put("assPath", previous.getString("assPath"));
            else {
                staged = UUID.randomUUID() + ".ass";
                try (FileOutputStream output = new FileOutputStream(file(staged))) {
                    output.write(call.getString("ass", "").getBytes(StandardCharsets.UTF_8)); output.getFD().sync();
                } catch (Exception error) { erase(staged); throw error; }
                next.put("assPath", staged);
            }
            next.put("revision", expected + 1);
            db.beginTransaction();
            try { check(readRecord(key), expected); put(next); db.setTransactionSuccessful(); }
            catch (Exception error) { erase(staged); throw error; }
            finally { db.endTransaction(); }
            if (previous != null && !previous.optString("assPath").equals(next.optString("assPath"))) erase(previous.optString("assPath"));
            return withRecord(next);
        });
    }
    @PluginMethod public void removeProject(PluginCall call) {
        execute(call, () -> {
            String key = id(call); JSONObject previous = readRecord(key); check(previous, call.getInt("revision", -1));
            db.beginTransaction();
            try {
                db.execSQL("DELETE FROM projects WHERE id=?", new Object[] { key });
                db.execSQL("DELETE FROM settings WHERE key='activeProject' AND value=?", new Object[] { key });
                db.setTransactionSuccessful();
            } finally { db.endTransaction(); }
            erase(previous.optString("assPath"));
            JSONObject video = previous.optJSONObject("video"); if (video != null) erase(video.optString("fileName"));
            return new JSObject();
        });
    }
    @PluginMethod public void getActive(PluginCall call) {
        execute(call, () -> {
            JSObject result = new JSObject();
            try (Cursor cursor = db.rawQuery("SELECT value FROM settings WHERE key='activeProject'", null)) {
                result.put("id", cursor.moveToFirst() ? cursor.getString(0) : JSONObject.NULL);
            } return result;
        });
    }
    @PluginMethod public void setActive(PluginCall call) {
        execute(call, () -> { db.execSQL("INSERT OR REPLACE INTO settings(key,value) VALUES ('activeProject',?)", new Object[] { call.getString("id") }); return new JSObject(); });
    }
    @PluginMethod public void videoPath(PluginCall call) {
        execute(call, () -> {
            JSONObject record = readRecord(id(call));
            File video = file(record.getJSONObject("video").getString("fileName"));
            if (!video.isFile()) throw new IOException("Private video is missing");
            JSObject result = new JSObject(); result.put("path", video.getAbsolutePath()); return result;
        });
    }
    @PluginMethod public void importVideo(PluginCall call) {
        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        picker.setType("video/*"); picker.addCategory(Intent.CATEGORY_OPENABLE);
        try { startActivityForResult(call, picker, "videoSelected"); }
        catch (Exception error) { call.reject("Cannot open video picker", "PICK_FAILED", error); }
    }
    @ActivityCallback private void videoSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) { call.reject("Cancelled", "CANCELLED"); return; }
        Uri uri = result.getData().getData();
        execute(call, () -> {
            String key = id(call); JSONObject previous = readRecord(key); int expected = call.getInt("revision", -1); check(previous, expected);
            String name = "video"; long size = -1;
            try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) { name = cursor.getString(0); if (!cursor.isNull(1)) size = cursor.getLong(1); }
            }
            String extension = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "mp4";
            if (!extension.matches("mp4|webm|mkv|mov|m4v|avi|3gp|mpeg|ts")) extension = "mp4";
            String filename = UUID.randomUUID() + "." + extension;
            if (size >= 0 && size > root.getUsableSpace() - 8 * 1024 * 1024) throw new IOException("Not enough private storage space");
            File target = file(filename); long copied = 0, lastProgress = 0;
            try (InputStream input = getContext().getContentResolver().openInputStream(uri); FileOutputStream output = new FileOutputStream(target)) {
                if (input == null) throw new IOException("Cannot read selected video");
                byte[] buffer = new byte[1024 * 1024]; int count;
                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count); copied += count;
                    if (System.currentTimeMillis() - lastProgress > 200) {
                        JSObject progress = new JSObject(); progress.put("copied", copied); progress.put("total", size);
                        notifyListeners("videoCopyProgress", progress); lastProgress = System.currentTimeMillis();
                    }
                }
                output.getFD().sync();
            } catch (Exception error) { erase(filename); throw error; }
            JSONObject video = new JSONObject(); video.put("kind", "private"); video.put("name", name); video.put("size", copied); video.put("fileName", filename);
            JSONObject next = new JSONObject(previous.toString()); next.put("video", video); next.put("revision", expected + 1);
            db.beginTransaction();
            try { check(readRecord(key), expected); put(next); db.setTransactionSuccessful(); }
            catch (Exception error) { erase(filename); throw error; }
            finally { db.endTransaction(); }
            JSONObject oldVideo = previous.optJSONObject("video"); if (oldVideo != null) erase(oldVideo.optString("fileName"));
            JSObject response = withRecord(next); response.put("path", target.getAbsolutePath()); return response;
        });
    }
    @Override protected void handleOnPause() { notifyListeners("appBackground", new JSObject()); }
}
