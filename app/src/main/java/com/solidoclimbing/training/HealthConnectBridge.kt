package com.solidoclimbing.training

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

class HealthConnectBridge(
    private val activity: Activity,
    private val webView: WebView,
    private val launchPermissionRequest: (Set<String>) -> Unit
) {
    companion object {
        val READ_PERMISSIONS: Set<String> = setOf(
            HealthPermission.getReadPermission(StepsRecord::class),
            HealthPermission.getReadPermission(DistanceRecord::class),
            HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
            HealthPermission.getReadPermission(HeartRateRecord::class),
            HealthPermission.getReadPermission(SleepSessionRecord::class)
        )
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile private var released = false

    @JavascriptInterface
    fun requestPermissions() {
        scope.launch {
            try {
                val client = getClientOrNull()
                if (client == null) {
                    sendStatus("Health Connect no está disponible o necesita actualizarse.")
                    return@launch
                }
                val granted = client.permissionController.getGrantedPermissions()
                if (granted.containsAll(READ_PERMISSIONS)) {
                    readToday()
                } else {
                    withContext(Dispatchers.Main) { launchPermissionRequest(READ_PERMISSIONS) }
                }
            } catch (_: Exception) {
                sendStatus("No se pudieron comprobar los permisos de Health Connect.")
            }
        }
    }

    @JavascriptInterface
    fun refresh() {
        scope.launch { readToday() }
    }

    fun onPermissionResult(granted: Set<String>) {
        if (granted.containsAll(READ_PERMISSIONS)) refresh()
        else sendStatus("Permisos no concedidos. Puedes autorizarlos cuando quieras.")
    }

    private fun getClientOrNull(): HealthConnectClient? {
        return if (HealthConnectClient.getSdkStatus(activity) == HealthConnectClient.SDK_AVAILABLE) {
            HealthConnectClient.getOrCreate(activity)
        } else null
    }

    private suspend fun readToday() {
        try {
            val client = getClientOrNull()
            if (client == null) {
                sendStatus("Instala o activa Health Connect para sincronizar la actividad.")
                return
            }
            val granted = client.permissionController.getGrantedPermissions()
            if (!granted.containsAll(READ_PERMISSIONS)) {
                sendStatus("Pulsa «Conectar Health Connect» para autorizar la lectura.")
                return
            }

            val zone = ZoneId.systemDefault()
            val now = ZonedDateTime.now(zone)
            val start = LocalDate.now(zone).atStartOfDay(zone).toInstant()
            val end = now.toInstant()
            val today = TimeRangeFilter.between(start, end)

            val steps = client.aggregate(
                AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), today)
            )[StepsRecord.COUNT_TOTAL] ?: 0L
            val distance = client.aggregate(
                AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL), today)
            )[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0
            val calories = client.aggregate(
                AggregateRequest(setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL), today)
            )[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0

            val heartRecords = client.readRecords(
                ReadRecordsRequest(
                    recordType = HeartRateRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(start.minusSeconds(86400), end),
                    ascendingOrder = false,
                    pageSize = 1000
                )
            ).records
            val latestHeart = heartRecords.flatMap { it.samples }.maxByOrNull { it.time }?.beatsPerMinute

            val sleepStart = LocalDate.now(zone).minusDays(1).atTime(18, 0).atZone(zone).toInstant()
            val sleepRecords = client.readRecords(
                ReadRecordsRequest(
                    recordType = SleepSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(sleepStart, end),
                    ascendingOrder = false,
                    pageSize = 100
                )
            ).records
            val lastSleep = sleepRecords.filter { it.endTime <= end }.maxByOrNull { it.endTime }
            val sleepMinutes = lastSleep?.let {
                Duration.between(it.startTime, it.endTime).toMinutes().coerceAtLeast(0)
            }

            send(
                JSONObject()
                    .put("type", "activity")
                    .put("steps", steps)
                    .put("distanceKm", distance / 1000.0)
                    .put("activeCalories", calories)
                    .put("heartRate", latestHeart ?: JSONObject.NULL)
                    .put("sleepMinutes", sleepMinutes ?: JSONObject.NULL)
                    .put("updatedAt", now.toString())
            )
        } catch (_: SecurityException) {
            sendStatus("Falta permiso para leer algún dato de Health Connect.")
        } catch (_: Exception) {
            sendStatus("No se han podido leer los datos de Health Connect.")
        }
    }

    private fun sendStatus(message: String) {
        send(JSONObject().put("type", "status").put("message", message))
    }

    private fun send(payload: JSONObject) {
        if (released) return
        val json = payload.toString()
        mainHandler.post {
            if (!released) webView.evaluateJavascript(
                "window.onHealthConnectData && window.onHealthConnectData(${JSONObject.quote(json)});",
                null
            )
        }
    }

    fun release() {
        released = true
    }
}
