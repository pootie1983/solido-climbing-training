package com.solidoclimbing.training

import android.content.Context
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

class HealthConnectBridge(
    private val context: Context,
    private val web: WebView
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val requiredPermissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class)
    )

    @JavascriptInterface
    fun refresh() {
        scope.launch {
            val result = withContext(Dispatchers.IO) { loadMetrics() }
            val payload = JSONObject.quote(result.toString())
            web.post {
                web.evaluateJavascript(
                    "window.onHealthConnectData && window.onHealthConnectData(JSON.parse($payload))",
                    null
                )
            }
        }
    }

    private suspend fun loadMetrics(): JSONObject {
        val result = JSONObject()
        try {
            val providerStatus = HealthConnectClient.getSdkStatus(
                context,
                HealthConnectClient.DEFAULT_PROVIDER_PACKAGE_NAME
            )
            if (providerStatus != HealthConnectClient.SDK_AVAILABLE) {
                result.put(
                    "status",
                    if (providerStatus == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) "update" else "unavailable"
                )
                return result
            }

            val client = HealthConnectClient.getOrCreate(context)
            val granted = client.permissionController.getGrantedPermissions()
            if (!granted.containsAll(requiredPermissions)) {
                result.put("status", "permission")
                return result
            }

            val now = Instant.now()
            val zone = ZoneId.systemDefault()
            val todayStart = now.atZone(zone).toLocalDate().atStartOfDay(zone).toInstant()
            val totals = client.aggregate(
                AggregateRequest(
                    metrics = setOf(
                        StepsRecord.COUNT_TOTAL,
                        DistanceRecord.DISTANCE_TOTAL,
                        ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
                    ),
                    timeRangeFilter = TimeRangeFilter.between(todayStart, now)
                )
            )

            result.put("status", "ok")
            result.put("steps", totals[StepsRecord.COUNT_TOTAL] ?: 0L)
            result.put("distanceMeters", totals[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0)
            result.put("activeCalories", totals[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0)

            val lastDay = now.minus(Duration.ofHours(24))
            val heartRecords = client.readRecords(
                ReadRecordsRequest(
                    recordType = HeartRateRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(lastDay, now),
                    ascendingOrder = false,
                    pageSize = 50
                )
            ).records
            val bpm = heartRecords.asSequence()
                .flatMap { it.samples.asSequence() }
                .maxByOrNull { it.time }
                ?.beatsPerMinute
            result.put("heartRate", bpm ?: JSONObject.NULL)

            val sleepRecords = client.readRecords(
                ReadRecordsRequest(
                    recordType = SleepSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(now.minus(Duration.ofHours(36)), now),
                    ascendingOrder = false,
                    pageSize = 10
                )
            ).records
            val lastSleep = sleepRecords.maxByOrNull { it.endTime }
            val sleepMinutes = lastSleep?.let { Duration.between(it.startTime, it.endTime).toMinutes() }
            result.put("sleepMinutes", sleepMinutes ?: JSONObject.NULL)
        } catch (error: Exception) {
            result.put("status", "error")
            result.put("message", error.message ?: "No se pudieron leer los datos")
        }
        return result
    }

    fun release() {
        scope.cancel()
    }
}
