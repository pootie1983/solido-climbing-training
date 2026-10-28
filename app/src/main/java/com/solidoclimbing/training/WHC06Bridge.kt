package com.solidoclimbing.training

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

class WHC06Bridge(
    private val activity: Activity,
    private val webView: WebView
) {
    companion object {
        private const val COMPANY_ID = 0x0100
        private const val PERMISSION_REQUEST = 4106
    }

    private val adapter: BluetoothAdapter? =
        (activity.getSystemService(Activity.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    private var scanner: BluetoothLeScanner? = null
    private var scanCallback: ScanCallback? = null
    private var scanning = false
    private var released = false

    @JavascriptInterface
    fun startScan() {
        activity.runOnUiThread { startScanInternal() }
    }

    @JavascriptInterface
    fun stopScan() {
        activity.runOnUiThread { stopScanInternal("Búsqueda finalizada") }
    }

    private fun requiredPermissions(): Array<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            )
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }

    private fun hasRequiredPermissions(): Boolean =
        requiredPermissions().all { permission ->
            ContextCompat.checkSelfPermission(activity, permission) ==
                PackageManager.PERMISSION_GRANTED
        }

    private fun startScanInternal() {
        if (released || scanning) return

        if (!hasRequiredPermissions()) {
            sendStatus("Solicitando permisos Bluetooth…")
            val missing = requiredPermissions().filter { permission ->
                ContextCompat.checkSelfPermission(activity, permission) !=
                    PackageManager.PERMISSION_GRANTED
            }.toTypedArray()
            ActivityCompat.requestPermissions(activity, missing, PERMISSION_REQUEST)
            return
        }

        val bluetoothAdapter = adapter
        if (bluetoothAdapter == null) {
            sendError("Bluetooth no está disponible en este móvil.")
            return
        }

        try {
            if (!bluetoothAdapter.isEnabled) {
                sendError("Activa el Bluetooth del móvil y vuelve a conectar.")
                return
            }

            val activeScanner = bluetoothAdapter.bluetoothLeScanner
            if (activeScanner == null) {
                sendError("No se pudo iniciar el escáner Bluetooth LE.")
                return
            }

            val callback = object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult) {
                    val data = result.scanRecord?.getManufacturerSpecificData(COMPANY_ID) ?: return
                    if (data.size < 12) return

                    val high = data[10].toInt() and 0xFF
                    val low = data[11].toInt() and 0xFF
                    val weightKg = ((high shl 8) or low) / 100.0

                    val payload = JSONObject()
                        .put("type", "weight")
                        .put("weight", weightKg)
                        .put("device", result.device.name ?: "WH-C06")
                        .put("address", result.device.address)
                    sendData(payload)
                }

                override fun onScanFailed(errorCode: Int) {
                    scanning = false
                    scanCallback = null
                    scanner = null
                    sendError("Error Bluetooth LE: $errorCode")
                }
            }

            scanner = activeScanner
            scanCallback = callback
            activeScanner.startScan(callback)
            scanning = true
            sendStatus("Buscando WH-C06 / IF_B7…")
        } catch (error: SecurityException) {
            scanning = false
            sendError("Faltan permisos Bluetooth: ${error.message ?: "permiso denegado"}")
        } catch (error: Exception) {
            scanning = false
            sendError("No se pudo iniciar Bluetooth: ${error.message ?: "error desconocido"}")
        }
    }

    fun onRequestPermissionsResult(requestCode: Int, grantResults: IntArray) {
        if (requestCode != PERMISSION_REQUEST) return
        if (grantResults.isNotEmpty() && grantResults.all {
                it == PackageManager.PERMISSION_GRANTED
            } && hasRequiredPermissions()
        ) {
            startScanInternal()
        } else {
            sendError("Sin permisos Bluetooth no se puede leer el medidor.")
        }
    }

    @SuppressLint("MissingPermission")
    private fun stopScanInternal(message: String) {
        try {
            if (scanning && hasRequiredPermissions()) {
                val activeScanner = scanner
                val activeCallback = scanCallback
                if (activeScanner != null && activeCallback != null) {
                    activeScanner.stopScan(activeCallback)
                }
            }
        } catch (_: Exception) {
            // Continue cleanup even if Android no longer permits stopping the scan.
        } finally {
            scanning = false
            scanner = null
            scanCallback = null
        }
        sendStatus(message)
    }

    private fun sendStatus(message: String) {
        sendData(JSONObject().put("type", "status").put("message", message))
    }

    private fun sendError(message: String) {
        sendData(JSONObject().put("type", "error").put("message", message))
    }

    private fun sendData(payload: JSONObject) {
        if (released) return
        val json = payload.toString()
        activity.runOnUiThread {
            if (!released) {
                webView.evaluateJavascript(
                    "window.onWHC06Data && window.onWHC06Data(${JSONObject.quote(json)});",
                    null
                )
            }
        }
    }

    fun release() {
        if (released) return
        stopScanInternal("Medidor desconectado.")
        released = true
    }
}
