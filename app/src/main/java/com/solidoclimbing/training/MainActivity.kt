package com.solidoclimbing.training

import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.PermissionController
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.ValueCallback
import android.content.Intent
import android.content.pm.ActivityInfo
import android.provider.MediaStore
import android.graphics.Bitmap
import android.util.Base64
import java.io.ByteArrayOutputStream
import android.view.View
import android.view.WindowManager
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.JavascriptInterface

class MainActivity : ComponentActivity() {
    private lateinit var healthConnectBridge: HealthConnectBridge
    private lateinit var healthPermissionLauncher: ActivityResultLauncher<Set<String>>
    private val healthPermissions: Set<String> = setOf(
        androidx.health.connect.client.permission.HealthPermission.getReadPermission(androidx.health.connect.client.records.StepsRecord::class),
        androidx.health.connect.client.permission.HealthPermission.getReadPermission(androidx.health.connect.client.records.DistanceRecord::class),
        androidx.health.connect.client.permission.HealthPermission.getReadPermission(androidx.health.connect.client.records.TotalCaloriesBurnedRecord::class),
        androidx.health.connect.client.permission.HealthPermission.getReadPermission(androidx.health.connect.client.records.HeartRateRecord::class),
        androidx.health.connect.client.permission.HealthPermission.getReadPermission(androidx.health.connect.client.records.SleepSessionRecord::class)
    )

    private lateinit var web: WebView
    private lateinit var coachOfflineTts: CoachOfflineTts
    private lateinit var whc06Bridge: WHC06Bridge
    private var gameFullscreenRequested = false
    private var previousRequestedOrientation: Int? = null
    private var fileChooserCallback: ValueCallback<Array<android.net.Uri>>? = null
    private val fileChooserRequestCode = 2001
    private val densityCameraRequestCode = 2002

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        healthPermissionLauncher = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { if (::healthConnectBridge.isInitialized) healthConnectBridge.refresh() }

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        // Coach clips start from the native speech callback, not a direct WebView tap.
        web.settings.mediaPlaybackRequiresUserGesture = false
        web.settings.allowFileAccess = true
        web.settings.allowContentAccess = true
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (::healthConnectBridge.isInitialized) healthConnectBridge.refresh()
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(webView: WebView?, filePathCallback: ValueCallback<Array<android.net.Uri>>?, fileChooserParams: FileChooserParams?): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback
                return try {
                    val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "image/*"
                    }
                    startActivityForResult(intent, fileChooserRequestCode)
                    true
                } catch (e: Exception) {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = null
                    false
                }
            }
        }
        web.setBackgroundColor(android.graphics.Color.rgb(8, 18, 27))
        healthConnectBridge = HealthConnectBridge(this, web)
        web.addJavascriptInterface(healthConnectBridge, "HealthConnect")
        whc06Bridge = WHC06Bridge(this, web)
        web.addJavascriptInterface(whc06Bridge, "WHC06")
        web.addJavascriptInterface(this, "AndroidUi")
        web.addJavascriptInterface(this, "AndroidCoach")
        coachOfflineTts = CoachOfflineTts(this) { state -> notifyCoachVoiceStatus(state) }
        setContentView(web)
        web.loadUrl("file:///android_asset/index.html")
    }

    @Deprecated("Deprecated in Android")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == fileChooserRequestCode) {
            val callback = fileChooserCallback
            fileChooserCallback = null
            val results = if (resultCode == RESULT_OK) WebChromeClient.FileChooserParams.parseResult(resultCode, data) else null
            callback?.onReceiveValue(results)
        }
        if (requestCode == densityCameraRequestCode && resultCode == RESULT_OK) {
            val bitmap = data?.extras?.get("data") as? Bitmap
            if (bitmap != null) {
                val output = ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, 88, output)
                val encoded = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
                web.evaluateJavascript("densityReceiveCameraPhoto('data:image/jpeg;base64,$encoded')", null)
            }
        }
    }

    private fun notifyCoachVoiceStatus(state: String) {
        if (isFinishing || isDestroyed || !::web.isInitialized) return
        runOnUiThread {
            if (!isFinishing && !isDestroyed && ::web.isInitialized) {
                try {
                    web.evaluateJavascript("window.onSolidoCoachVoiceStatus && window.onSolidoCoachVoiceStatus('$state')", null)
                } catch (_: IllegalStateException) {
                    // WebView may already be shutting down with the Activity.
                }
            }
        }
    }

    @JavascriptInterface
    fun speakCoachText(text: String) {
        val cleanText = text.trim().take(1800)
        if (cleanText.isEmpty()) {
            notifyCoachVoiceStatus("error")
            return
        }
        if (!::coachOfflineTts.isInitialized) {
            notifyCoachVoiceStatus("unavailable")
            return
        }
        coachOfflineTts.speak(cleanText)
    }

    @JavascriptInterface
    fun stopCoachSpeech() {
        if (::coachOfflineTts.isInitialized) coachOfflineTts.stop()
    }

    @JavascriptInterface
    fun requestHealthPermissions() {
        runOnUiThread {
            try {
                if (!::healthPermissionLauncher.isInitialized) {
                    web.evaluateJavascript("window.onHealthConnectRequestError && window.onHealthConnectRequestError('El gestor de permisos todavía no está preparado')", null)
                    return@runOnUiThread
                }
                healthPermissionLauncher.launch(healthPermissions)
            } catch (error: Exception) {
                val message = (error.message ?: "No se pudieron abrir los permisos").replace("\\", "\\\\").replace("'", "\\'")
                web.evaluateJavascript("window.onHealthConnectRequestError && window.onHealthConnectRequestError('$message')", null)
            }
        }
    }

    @JavascriptInterface
    fun openDensityCamera() {
        runOnUiThread {
            try {
                val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                if (intent.resolveActivity(packageManager) != null) startActivityForResult(intent, densityCameraRequestCode)
                else web.evaluateJavascript("document.getElementById('densityCameraInput').click()", null)
            } catch (e: Exception) {
                web.evaluateJavascript("document.getElementById('densityCameraInput').click()", null)
            }
        }
    }

    @JavascriptInterface
    fun enterGameFullscreen() {
        runOnUiThread {
            gameFullscreenRequested = true
            if (previousRequestedOrientation == null) previousRequestedOrientation = requestedOrientation
            requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            applyGameFullscreen()
        }
    }

    @JavascriptInterface
    fun exitGameFullscreen() {
        runOnUiThread {
            gameFullscreenRequested = false
            previousRequestedOrientation?.let { requestedOrientation = it }
            previousRequestedOrientation = null
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                window.insetsController?.show(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                window.setDecorFitsSystemWindows(true)
            }
            window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && gameFullscreenRequested) applyGameFullscreen()
    }

    private fun applyGameFullscreen() {
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (::whc06Bridge.isInitialized) whc06Bridge.onRequestPermissionsResult(requestCode, grantResults)
    }

    @Deprecated("Deprecated in Android")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        if (::healthConnectBridge.isInitialized) healthConnectBridge.release()
        if (::whc06Bridge.isInitialized) whc06Bridge.release()
        if (::coachOfflineTts.isInitialized) coachOfflineTts.release()
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }
}
