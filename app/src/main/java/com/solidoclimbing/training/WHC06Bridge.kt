```kotlin
package com.solidoclimbing.training

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.ContextCompat
import java.util.Locale

class WHC06Bridge(
    private val context: Context,
    private val webView: WebView
) {

    companion object {
        private const val MANUFACTURER_ID = 0x0100
        private const val WEIGHT_OFFSET = 10
    }

    private var scannerCallback: ScanCallback? = null
    private var scanning = false

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        val manager =
            context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        manager.adapter
    }

    @JavascriptInterface
    fun startScan() {
        webView.post {
            if (!hasBluetoothPermission()) {
                sendStatus("permission")
                return@post
            }

            val adapter = bluetoothAdapter

            if (adapter == null) {
                sendStatus("unsupported")
                return@post
            }

            if (!adapter.isEnabled) {
                sendStatus("disabled")
                return@post
            }

            startBleScan()
        }
    }

    @JavascriptInterface
    fun stopScan() {
        stopBleScan()
    }

    private fun startBleScan() {
        if (scanning) return

        val adapter = bluetoothAdapter ?: return
        val scanner = adapter.bluetoothLeScanner

        if (scanner == null) {
            sendStatus("scanner_error")
            return
        }

        sendStatus("scanning")

        val filter = ScanFilter.Builder()
            .setManufacturerData(MANUFACTURER_ID, null)
            .build()

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        scannerCallback = object : ScanCallback() {

            override fun onScanResult(
                callbackType: Int,
                result: ScanResult
            ) {
                processResult(result)
            }

            override fun onBatchScanResults(results: MutableList<ScanResult>) {
                results.forEach { processResult(it) }
            }

            override fun onScanFailed(errorCode: Int) {
                scanning = false
                sendStatus("scan_error:$errorCode")
            }
        }

        scanner.startScan(
            listOf(filter),
            settings,
            scannerCallback
        )

        scanning = true
    }

    private fun processResult(result: ScanResult) {

        val device: BluetoothDevice = result.device

        val deviceName = try {
            device.name
        } catch (_: SecurityException) {
            null
        }

        val manufacturerData =
            result.scanRecord?.manufacturerSpecificData

        if (manufacturerData == null) return

        val data = manufacturerData.get(MANUFACTURER_ID)
            ?: return

        if (data.size <= WEIGHT_OFFSET + 1) return

        val high = data[WEIGHT_OFFSET].toInt() and 0xFF
        val low = data[WEIGHT_OFFSET + 1].toInt() and 0xFF

        val rawWeight = (high shl 8) or low

        val kilograms = rawWeight / 100.0

        val displayName =
            if (!deviceName.isNullOrBlank()) deviceName else "IF_B7"

        sendMeasurement(
            displayName,
            kilograms
        )
    }

    private fun sendMeasurement(
        deviceName: String,
        kilograms: Double
    ) {
        val safeKg = kilograms.coerceAtLeast(-1000.0)

        val js = """
            window.SOLIDO_WH_C06 &&
            window.SOLIDO_WH_C06.onMeasurement(
                ${safeJsString(deviceName)},
                ${String.format(Locale.US, "%.2f", safeKg)}
            );
        """.trimIndent()

        webView.post {
            webView.evaluateJavascript(js, null)
        }
    }

    private fun sendStatus(status: String) {

        val js = """
            window.SOLIDO_WH_C06 &&
            window.SOLIDO_WH_C06.onStatus(
                ${safeJsString(status)}
            );
        """.trimIndent()

        webView.post {
            webView.evaluateJavascript(js, null)
        }
    }

    private fun safeJsString(value: String): String {
        return "\"" +
                value
                    .replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r") +
                "\""
    }

    private fun hasBluetoothPermission(): Boolean {

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {

            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.BLUETOOTH_SCAN
            ) == PackageManager.PERMISSION_GRANTED

        } else {

            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        }
    }

    fun stopBleScan() {

        if (!scanning) return

        if (!hasBluetoothPermission()) return

        val scanner = bluetoothAdapter?.bluetoothLeScanner
            ?: return

        scannerCallback?.let {
            scanner.stopScan(it)
        }

        scannerCallback = null
        scanning = false

        sendStatus("stopped")
    }
}
```
