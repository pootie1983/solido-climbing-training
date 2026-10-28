
package com.solidoclimbing.training

import android.Manifest
import android.app.Activity
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {

    private lateinit var web: WebView
    private var scanner: BluetoothLeScanner? = null
    private var scanning = false
    private val permissionRequest = 4106

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val bytes = result.scanRecord
                ?.getManufacturerSpecificData(0x0100) ?: return

            // WH-C06: bytes 10 y 11, valor en centésimas de kg.
            if (bytes.size < 12) return

            val raw = ((bytes[10].toInt() and 0xFF) shl 8) or
                    (bytes[11].toInt() and 0xFF)
            val kg = raw / 100.0

            runOnUiThread {
                web.evaluateJavascript(
                    "window.onWHC06Reading && window.onWHC06Reading({kg:$kg})",
                    null
                )
            }
        }

        override fun onScanFailed(errorCode: Int) {
            scanning = false
            notifyConnection(false, "Error Bluetooth: $errorCode")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = WebViewClient()
        web.setBackgroundColor(android.graphics.Color.rgb(8, 18, 27))
        web.addJavascriptInterface(BluetoothBridge(), "AndroidWHC06")
        setContentView(web)
        web.loadUrl("file:///android_asset/index.html")
    }

    private fun requiredPermissions(): Array<String> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            )
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }

    private fun hasPermissions(): Boolean =
        requiredPermissions().all {
            checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
        }

    private fun ensurePermissions(): Boolean {
        if (hasPermissions()) return true
        requestPermissions(requiredPermissions(), permissionRequest)
        return false
    }

    private fun startScanning() {
        if (scanning) return
        if (!ensurePermissions()) {
            notifyConnection(false, "Acepta los permisos Bluetooth y vuelve a conectar.")
            return
        }

        try {
            val manager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
            val adapter = manager.adapter

            if (adapter == null || !adapter.isEnabled) {
                notifyConnection(false, "Activa el Bluetooth del móvil.")
                return
            }

            scanner = adapter.bluetoothLeScanner
            if (scanner == null) {
                notifyConnection(false, "No se puede iniciar el escáner Bluetooth.")
                return
            }

            scanner?.startScan(scanCallback)
            scanning = true
            notifyConnection(true, "Buscando el WH-C06 (IF_B7)…")
        } catch (e: SecurityException) {
            notifyConnection(false, "Faltan permisos Bluetooth: ${e.message}")
        } catch (e: Exception) {
            notifyConnection(false, "No se pudo iniciar Bluetooth: ${e.message}")
        }
    }

    private fun stopScanning() {
        try {
            if (scanning && hasPermissions()) {
                scanner?.stopScan(scanCallback)
            }
        } catch (_: Exception) {
        }
        scanning = false
        scanner = null
        notifyConnection(false, "Medidor desconectado.")
    }

    private fun notifyConnection(connected: Boolean, message: String) {
        if (!::web.isInitialized) return
        val safeMessage = org.json.JSONObject.quote(message)
        runOnUiThread {
            web.evaluateJavascript(
                "window.onWHC06Connection && window.onWHC06Connection(" +
                    "{connected:$connected,message:$safeMessage})",
                null
            )
        }
    }

    inner class BluetoothBridge {
        @JavascriptInterface
        fun connect() {
            runOnUiThread { startScanning() }
        }

        @JavascriptInterface
        fun disconnect() {
            runOnUiThread { stopScanning() }
        }

        @JavascriptInterface
        fun startStream() {
            runOnUiThread { startScanning() }
        }

        @JavascriptInterface
        fun stopStream() {
            runOnUiThread { stopScanning() }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == permissionRequest) {
            if (hasPermissions()) {
                startScanning()
            } else {
                notifyConnection(false, "Sin permisos Bluetooth no se puede leer el medidor.")
            }
        }
    }

    override fun onDestroy() {
        stopScanning()
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Android")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) {
            web.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
