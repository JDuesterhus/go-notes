package com.gonotes.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.Menu
import android.view.MenuItem
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar

/**
 * Thin native shell around the go-notes web app. It keeps the configured
 * server in a WebView, opens foreign links in the browser and forwards the
 * Markdown file picker to Android's document picker.
 */
class WebViewActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var serverUrl: String
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingExport: Pair<ByteArray, String>? = null

    private val fileChooser =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileChooserCallback ?: return@registerForActivityResult
            fileChooserCallback = null
            callback.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data),
            )
        }

    private val saveExport =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val export = pendingExport
            pendingExport = null
            val uri = result.data?.data
            if (result.resultCode != Activity.RESULT_OK || export == null || uri == null) {
                return@registerForActivityResult
            }

            try {
                contentResolver.openOutputStream(uri)?.use { it.write(export.first) }
                Toast.makeText(
                    this,
                    getString(R.string.export_saved, export.second),
                    Toast.LENGTH_LONG,
                ).show()
            } catch (_: Exception) {
                Toast.makeText(this, R.string.export_failed, Toast.LENGTH_LONG).show()
            }
        }

    /** Receives exported files from the web app and lets the user choose where to save them. */
    private inner class FileSaver {
        @JavascriptInterface
        fun saveFile(base64: String, fileName: String, mimeType: String) {
            val bytes = try {
                Base64.decode(base64, Base64.DEFAULT)
            } catch (_: IllegalArgumentException) {
                return
            }

            runOnUiThread {
                pendingExport = bytes to fileName
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = mimeType.ifBlank { "application/octet-stream" }
                    putExtra(Intent.EXTRA_TITLE, fileName)
                }

                try {
                    saveExport.launch(intent)
                } catch (_: Exception) {
                    pendingExport = null
                    Toast.makeText(this@WebViewActivity, R.string.export_failed, Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_webview)

        serverUrl = intent.getStringExtra(MainActivity.EXTRA_URL)
            ?: getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE)
                .getString(MainActivity.KEY_URL, null)
            ?: run {
                finish()
                return
            }

        val toolbar = findViewById<Toolbar>(R.id.toolbar)
        setSupportActionBar(toolbar)
        supportActionBar?.title = getString(R.string.app_name)

        webView = findViewById(R.id.webview)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.addJavascriptInterface(FileSaver(), "GoNotesNative")
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                val uri = request.url
                val scheme = uri.scheme?.lowercase()
                if (scheme != "http" && scheme != "https") {
                    return openExternally(uri)
                }
                return if (uri.host == Uri.parse(serverUrl).host) {
                    false
                } else {
                    openExternally(uri)
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError,
            ) {
                if (request.isForMainFrame) {
                    Toast.makeText(
                        this@WebViewActivity,
                        R.string.load_failed,
                        Toast.LENGTH_LONG,
                    ).show()
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onReceivedTitle(view: WebView, title: String?) {
                super.onReceivedTitle(view, title)
                supportActionBar?.title = title?.takeIf { it.isNotBlank() }
                    ?: getString(R.string.app_name)
            }

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = callback
                return try {
                    val intent = params.createIntent()
                    intent.addCategory(Intent.CATEGORY_OPENABLE)
                    intent.type = "*/*"
                    fileChooser.launch(intent)
                    true
                } catch (_: Exception) {
                    fileChooserCallback = null
                    false
                }
            }
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        finish()
                    }
                }
            },
        )

        webView.loadUrl(serverUrl)
    }

    private fun openExternally(uri: Uri): Boolean = try {
        startActivity(Intent(Intent.ACTION_VIEW, uri))
        true
    } catch (_: Exception) {
        false
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.webview_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        R.id.action_reload -> {
            webView.reload()
            true
        }

        R.id.action_change_server -> {
            getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE)
                .edit()
                .remove(MainActivity.KEY_URL)
                .apply()
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            true
        }

        else -> super.onOptionsItemSelected(item)
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }
}
