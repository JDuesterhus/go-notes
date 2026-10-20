package com.gonotes.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity

/**
 * First-run screen: ask for the go-notes server, remember it and open the
 * WebView shell. If a server is already stored, it is opened directly.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var serverInput: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val saved = prefs().getString(KEY_URL, null)
        if (!saved.isNullOrBlank()) {
            openWebView(saved)
            return
        }

        setContentView(R.layout.activity_main)
        serverInput = findViewById(R.id.server_url)
        findViewById<Button>(R.id.connect_button).setOnClickListener { connect() }
        serverInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE) {
                connect()
                true
            } else {
                false
            }
        }
    }

    private fun connect() {
        val url = normalize(serverInput.text?.toString().orEmpty())
        if (url == null) {
            serverInput.error = getString(R.string.invalid_url)
            return
        }

        prefs().edit().putString(KEY_URL, url).apply()
        openWebView(url)
    }

    private fun openWebView(url: String) {
        startActivity(Intent(this, WebViewActivity::class.java).putExtra(EXTRA_URL, url))
        finish()
    }

    private fun prefs() = getSharedPreferences(PREFS, MODE_PRIVATE)

    companion object {
        const val PREFS = "go-notes"
        const val KEY_URL = "server_url"
        const val EXTRA_URL = "server_url"

        /** Accepts "host", "host:port" and full URLs; defaults to https. */
        fun normalize(raw: String): String? {
            var value = raw.trim()
            if (value.isEmpty()) return null
            if (!value.startsWith("http://", ignoreCase = true) &&
                !value.startsWith("https://", ignoreCase = true)
            ) {
                value = "https://$value"
            }
            value = value.trimEnd('/')

            return try {
                val uri = Uri.parse(value)
                val scheme = uri.scheme?.lowercase()
                if ((scheme == "http" || scheme == "https") && !uri.host.isNullOrBlank()) {
                    value
                } else {
                    null
                }
            } catch (_: Exception) {
                null
            }
        }
    }
}
