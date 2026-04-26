package com.localbeam.utils

import android.content.Context

object PrefsHelper {
    private const val PREFS_NAME = "localbeam_prefs"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_RECENT_URLS = "recent_urls"

    fun saveServerUrl(context: Context, url: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_SERVER_URL, url).apply()
        addRecentUrl(context, url)
    }

    fun getServerUrl(context: Context): String {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_SERVER_URL, "") ?: ""
    }

    private fun addRecentUrl(context: Context, url: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val existing = getRecentUrls(context).toMutableList()
        existing.remove(url)
        existing.add(0, url)
        val capped = existing.take(5)
        prefs.edit().putString(KEY_RECENT_URLS, capped.joinToString("|")).apply()
    }

    fun getRecentUrls(context: Context): List<String> {
        val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_RECENT_URLS, "") ?: ""
        return if (raw.isEmpty()) emptyList() else raw.split("|")
    }
}
