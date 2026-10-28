package com.solidoclimbing.training

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var whc06Bridge: WHC06Bridge

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

        setContentView(web)
        web.loadUrl("file:///android_asset/index.html")
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
