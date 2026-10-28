package com.solidoclimbing.training

import android.Manifest
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : Activity() {

    private lateinit var web: WebView

    companion object {
        private const val BLUETOOTH_PERMISSION_REQUEST = 1001
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestBluetoothPermissions()

        web = WebView(this)

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = true
        web.settings.allowContentAccess = true

        web.webViewClient = WebViewClient()

        web.setBackgroundColor(
            android.graphics.Color.rgb(8, 18, 27)
        )

        web.addJavascriptInterface(
            BluetoothBridge(this),
            "SolidoBluetooth"
        )

        setContentView(web)

        web.loadUrl("file:///android_asset/index.html")
    }

    private fun requestBluetoothPermissions() {

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {

            val permissions = arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            )

            val missing = permissions.filter {
                ContextCompat.checkSelfPermission(
                    this,
                    it
                ) != PackageManager.PERMISSION_GRANTED
            }

            if (missing.isNotEmpty()) {
                ActivityCompat.requestPermissions(
                    this,
                    missing.toTypedArray(),
                    BLUETOOTH_PERMISSION_REQUEST
                )
            }
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

    class BluetoothBridge(
        private val activity: Activity
    ) {

        @JavascriptInterface
        fun isBluetoothAvailable(): Boolean {

            val manager =
                activity.getSystemService(
                    Context.BLUETOOTH_SERVICE
                ) as BluetoothManager

            return manager.adapter != null
        }

        @JavascriptInterface
        fun isBluetoothEnabled(): Boolean {

            val manager =
                activity.getSystemService(
                    Context.BLUETOOTH_SERVICE
                ) as BluetoothManager

            return manager.adapter?.isEnabled == true
        }

        @JavascriptInterface
        fun showMessage(message: String) {

            activity.runOnUiThread {
                Toast.makeText(
                    activity,
                    message,
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }
}
