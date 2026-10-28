```kotlin
package com.solidoclimbing.training

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var whc06Bridge: WHC06Bridge

    companion object {
        private const val BLUETOOTH_PERMISSION_REQUEST = 1001
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestBluetoothPermissions()

        webView = WebView(this)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
        }

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()

        whc06Bridge = WHC06Bridge(this)

        whc06Bridge.setCallback { json ->

            runOnUiThread {

                val escapedJson =
                    JSONObject.quote(json)

                webView.evaluateJavascript(
                    "window.onWHC06Data && window.onWHC06Data($escapedJson);",
                    null
                )
            }
        }

        webView.addJavascriptInterface(
            whc06Bridge,
            "WHC06"
        )

        setContentView(webView)

        webView.loadUrl(
            "file:///android_asset/index.html"
        )
    }

    private fun requestBluetoothPermissions() {

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {

            val permissions = arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            )

            val missingPermissions =
                permissions.filter {
                    ContextCompat.checkSelfPermission(
                        this,
                        it
                    ) != PackageManager.PERMISSION_GRANTED
                }

            if (missingPermissions.isNotEmpty()) {

                ActivityCompat.requestPermissions(
                    this,
                    missingPermissions.toTypedArray(),
                    BLUETOOTH_PERMISSION_REQUEST
                )
            }
        } else {

            val locationPermission =
                Manifest.permission.ACCESS_FINE_LOCATION

            if (
                ContextCompat.checkSelfPermission(
                    this,
                    locationPermission
                ) != PackageManager.PERMISSION_GRANTED
            ) {

                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(locationPermission),
                    BLUETOOTH_PERMISSION_REQUEST
                )
            }
        }
    }

    override fun onDestroy() {

        if (::whc06Bridge.isInitialized) {
            whc06Bridge.release()
        }

        if (::webView.isInitialized) {
            webView.destroy()
        }

        super.onDestroy()
    }
}
```
