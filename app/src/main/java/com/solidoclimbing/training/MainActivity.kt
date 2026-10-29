package com.solidoclimbing.training

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface

class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var whc06Bridge: WHC06Bridge
    private var gameFullscreenRequested = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = true
        web.settings.allowContentAccess = true
        web.webViewClient = WebViewClient()
        web.setBackgroundColor(android.graphics.Color.rgb(8, 18, 27))

        whc06Bridge = WHC06Bridge(this, web)
        web.addJavascriptInterface(whc06Bridge, "WHC06")
        web.addJavascriptInterface(this, "AndroidUi")

        setContentView(web)
        web.loadUrl("file:///android_asset/index.html")
    }

    @JavascriptInterface
    fun enterGameFullscreen() {
        runOnUiThread {
            gameFullscreenRequested = true
            applyGameFullscreen()
        }
    }

    @JavascriptInterface
    fun exitGameFullscreen() {
        runOnUiThread {
            gameFullscreenRequested = false
            window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
        }
    }

    // Android can reveal system bars again after focus changes; re-apply immersive mode while playing.
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && gameFullscreenRequested) applyGameFullscreen()
    }

    private fun applyGameFullscreen() {
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
            View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (::whc06Bridge.isInitialized) {
            whc06Bridge.onRequestPermissionsResult(requestCode, grantResults)
        }
    }

    @Deprecated("Deprecated in Android")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) {
            web.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        if (::whc06Bridge.isInitialized) whc06Bridge.release()
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }
}
