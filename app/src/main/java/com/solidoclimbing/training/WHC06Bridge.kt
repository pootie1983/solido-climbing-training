```kotlin
package com.solidoclimbing.training

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import org.json.JSONObject

class WHC06Bridge(private val context: Context) {

    companion object {
        private const val TAG = "WHC06Bridge"
        private const val COMPANY_ID = 0x0100
    }

    private val handler = Handler(Looper.getMainLooper())
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var scanning = false

    private var javascriptCallback: ((String) -> Unit)? = null

    init {
        val bluetoothManager =
            context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager

        bluetoothAdapter = bluetoothManager.adapter
    }

    fun setCallback(callback: (String) -> Unit) {
        javascriptCallback = callback
    }

    @SuppressLint("MissingPermission")
    @JavascriptInterface
    fun startScan() {

        if (scanning) return

        val adapter = bluetoothAdapter

        if (adapter == null) {
            sendError("Bluetooth no disponible")
            return
        }

        if (!adapter.isEnabled) {
            sendError("Bluetooth está desactivado")
            return
        }

        scanning = true

        sendStatus("Buscando WH-C06...")

        adapter.bluetoothLeScanner?.startScan(
            object : android.bluetooth.le.ScanCallback() {

                override fun onScanResult(
                    callbackType: Int,
                    result: android.bluetooth.le.ScanResult
                ) {
                    val device = result.device
                    val scanRecord = result.scanRecord

                    if (scanRecord == null) return

                    val manufacturerData =
                        scanRecord.getManufacturerSpecificData(COMPANY_ID)

                    if (manufacturerData != null) {

                        Log.d(
                            TAG,
                            "WH-C06 encontrado: ${device.name ?: device.address}"
                        )

                        val weight = readWeight(manufacturerData)

                        if (weight != null) {

                            val json = JSONObject()

                            json.put("type", "weight")
                            json.put("weight", weight)
                            json.put(
                                "device",
                                device.name ?: "WH-C06"
                            )
                            json.put(
                                "address",
                                device.address
                            )

                            javascriptCallback?.invoke(
                                json.toString()
                            )
                        }
                    }
                }

                override fun onScanFailed(errorCode: Int) {
                    scanning = false
                    sendError(
                        "Error Bluetooth LE: $errorCode"
                    )
                }
            }
        )

        handler.postDelayed(
            {
                stopScan()
            },
            30000
        )
    }

    @SuppressLint("MissingPermission")
    @JavascriptInterface
    fun stopScan() {

        if (!scanning) return

        bluetoothAdapter
            ?.bluetoothLeScanner
            ?.stopScan(
                object : android.bluetooth.le.ScanCallback() {}
            )

        scanning = false

        sendStatus("Búsqueda finalizada")
    }

    private fun readWeight(data: ByteArray): Double? {

        /*
         * WH-C06:
         *
         * Offset utilizado por la implementación Web Bluetooth:
         * byte 10 + byte 11
         *
         * Peso:
         * ((byte10 << 8) | byte11) / 100
         */

        if (data.size < 12) {
            return null
        }

        val high = data[10].toInt() and 0xFF
        val low = data[11].toInt() and 0xFF

        val rawWeight =
            (high shl 8) or low

        return rawWeight / 100.0
    }

    private fun sendStatus(message: String) {

        val json = JSONObject()

        json.put("type", "status")
        json.put("message", message)

        javascriptCallback?.invoke(
            json.toString()
        )
    }

    private fun sendError(message: String) {

        val json = JSONObject()

        json.put("type", "error")
        json.put("message", message)

        javascriptCallback?.invoke(
            json.toString()
        )
    }

    fun release() {

        try {
            stopScan()
        } catch (_: Exception) {
        }

        javascriptCallback = null
    }
}
```
