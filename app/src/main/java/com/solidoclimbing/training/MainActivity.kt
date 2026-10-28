```kotlin
package com.solidoclimbing.training

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var whc06Bridge: WHC06Bridge

    private val bluetoothRequestCode = 1001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this)

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = true
        web.settings.allowContentAccess = true

        web.webViewClient = WebViewClient()
        web.webChromeClient = WebChromeClient()

        web.setBackgroundColor(
            android.graphics.Color.rgb(8, 18, 27)
        )

        whc06Bridge = WHC06Bridge(
            this,
            web
        )

        web.addJavascriptInterface(
            whc06Bridge,
            "AndroidWHC06"
        )

        setContentView(web)

        web.loadUrl(
            "file:///android_asset/index.html"
        )

        requestBluetoothPermissions()
    }

    private fun requestBluetoothPermissions() {

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {

            val permissions = arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            )

            requestPermissions(
                permissions,
                bluetoothRequestCode
            )

        } else {

            requestPermissions(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION
                ),
                bluetoothRequestCode
            )
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(
            requestCode,
            permissions,
            grantResults
        )

        if (requestCode == bluetoothRequestCode) {

            val granted =
                grantResults.isNotEmpty() &&
                grantResults.all {
                    it == PackageManager.PERMISSION_GRANTED
                }

            if (!granted) {
                Toast.makeText(
                    this,
                    "Permisos Bluetooth necesarios para WH-C06",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    @Deprecated("Deprecated in Android")
    override fun onBackPressed() {

        if (web.canGoBack()) {
            web.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {

        try {
            whc06Bridge.stopBleScan()
        } catch (_: Exception) {
        }

        web.removeJavascriptInterface(
            "AndroidWHC06"
        )

        web.destroy()

        super.onDestroy()
    }
}
```
