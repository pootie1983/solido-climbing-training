package com.solidoclimbing.training

import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.PermissionController
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.graphics.Color
import android.graphics.Typeface
import android.view.WindowManager
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.JavascriptInterface
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

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
    private var coachTts: TextToSpeech? = null
    private var coachTtsReady = false
    private var pendingCoachSpeech: String? = null
    private var coachUtteranceSequence = 0L
    private var currentCoachUtteranceId: String? = null
    private val coachVoicePreferences by lazy { getSharedPreferences("solido_coach_voice", MODE_PRIVATE) }
    private lateinit var whc06Bridge: WHC06Bridge
    private var gameFullscreenRequested = false
    private var previousRequestedOrientation: Int? = null
    private var fileChooserCallback: ValueCallback<Array<android.net.Uri>>? = null
    private val fileChooserRequestCode = 2001
    private val densityCameraRequestCode = 2002
    private val trialPreferences by lazy { getSharedPreferences("solido_beta_trial", MODE_PRIVATE) }
    private val trialHandler = Handler(Looper.getMainLooper())
    private var trialRoot: FrameLayout? = null
    private var expiredOverlay: View? = null
    private var trialExpired = false
    private val trialCheckRunnable = object : Runnable {
        override fun run() {
            enforceTrialLimit()
            if (!trialExpired) trialHandler.postDelayed(this, 60_000L)
        }
    }
    private val trialDurationMs = 10L * 24L * 60L * 60L * 1000L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        initializeTrialPeriod()
        healthPermissionLauncher = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { if (::healthConnectBridge.isInitialized) healthConnectBridge.refresh() }

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
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
        val root = FrameLayout(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        trialRoot = root
        expiredOverlay = createTrialExpiredOverlay()
        root.addView(expiredOverlay, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        web.loadUrl("file:///android_asset/index.html")
        enforceTrialLimit()
        trialHandler.postDelayed(trialCheckRunnable, 60_000L)
    }


    // La prueba comienza en la primera apertura y queda guardada aunque se cierre la app.
    private fun initializeTrialPeriod() {
        val firstOpen = trialPreferences.getLong("first_open_at", 0L)
        if (firstOpen == 0L) {
            trialPreferences.edit().putLong("first_open_at", System.currentTimeMillis()).commit()
        }
    }

    private fun createTrialExpiredOverlay(): View {
        val container = LinearLayout(this).apply {
            visibility = View.GONE
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(36, 36, 36, 36)
            setBackgroundColor(Color.rgb(7, 17, 27))
            isClickable = true
            isFocusable = true
        }
        val title = TextView(this).apply {
            text = "TIEMPO EXPIRADO"
            setTextColor(Color.WHITE)
            textSize = 30f
            typeface = Typeface.create("sans-serif", Typeface.BOLD)
            gravity = Gravity.CENTER
        }
        val message = TextView(this).apply {
            text = "El periodo de prueba de BETA SOLIDO CLIMBING ha finalizado.\\n\\nDesinstala esta versión para instalar la versión completa."
            setTextColor(Color.rgb(218, 228, 236))
            textSize = 17f
            gravity = Gravity.CENTER
            setPadding(12, 24, 12, 0)
        }
        container.addView(title, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        container.addView(message, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        return container
    }

    private fun enforceTrialLimit() {
        if (trialExpired) return
        val firstOpen = trialPreferences.getLong("first_open_at", 0L)
        val now = System.currentTimeMillis()
        val expired = firstOpen <= 0L || now < firstOpen || now - firstOpen >= trialDurationMs
        if (expired) {
            trialExpired = true
            web.stopLoading()
            web.onPause()
            web.pauseTimers()
            web.visibility = View.GONE
            expiredOverlay?.visibility = View.VISIBLE
            trialHandler.removeCallbacks(trialCheckRunnable)
        }
    }

    override fun onResume() {
        super.onResume()
        if (trialRoot != null) {
            enforceTrialLimit()
            if (!trialExpired) trialHandler.postDelayed(trialCheckRunnable, 1_000L)
        }
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

    // Inicializa el motor instalado en el móvil. No incorpora voces ni archivos al APK.
    private fun initializeCoachTts(onReady: (() -> Unit)? = null) {
        if (coachTts != null) {
            if (coachTtsReady) onReady?.invoke()
            return
        }
        // Respeta el motor TTS predeterminado elegido en los ajustes de Android.
        coachTts = TextToSpeech(this, { status ->
            runOnUiThread {
                if (status == TextToSpeech.SUCCESS) {
                    coachTtsReady = true
                    configureCoachSpanishVoice()
                    coachTts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String?) {
                            if (utteranceId == currentCoachUtteranceId) notifyCoachVoiceStatus("started")
                        }
                        override fun onRangeStart(utteranceId: String?, start: Int, end: Int, frame: Int) {
                            if (utteranceId == currentCoachUtteranceId) {
                                runOnUiThread {
                                    if (::web.isInitialized) web.evaluateJavascript("window.onSolidoCoachSpeechRange && window.onSolidoCoachSpeechRange($start,$end)", null)
                                }
                            }
                        }
                        override fun onDone(utteranceId: String?) {
                            if (utteranceId == currentCoachUtteranceId) notifyCoachVoiceStatus("done")
                        }
                        override fun onError(utteranceId: String?) {
                            if (utteranceId == currentCoachUtteranceId) notifyCoachVoiceStatus("error")
                        }
                    })
                    pendingCoachSpeech?.let { pending ->
                        pendingCoachSpeech = null
                        speakCoachTextNow(pending)
                    }
                    onReady?.invoke()
                } else {
                    pendingCoachSpeech = null
                    notifyCoachVoiceStatus("unavailable")
                }
            }
        })
    }

    @JavascriptInterface
    fun speakCoachText(text: String) {
        runOnUiThread {
            val cleanText = text.trim().replace(Regex("\\bcoach\\b", RegexOption.IGNORE_CASE), "Kóuch").take(1800)
            if (cleanText.isEmpty()) return@runOnUiThread
            if (coachTts == null) {
                pendingCoachSpeech = cleanText
                initializeCoachTts()
            } else if (coachTtsReady) {
                speakCoachTextNow(cleanText)
            } else {
                pendingCoachSpeech = cleanText
            }
        }
    }

    // Conserva la voz 7 que el usuario eligió en el selector.
    // Si se instala de nuevo y no hay preferencia guardada, usa esa misma posición.
    private fun configureCoachSpanishVoice() {
        val tts = coachTts ?: return
        val spanishVoices = tts.voices
            ?.filter { it.locale.language == "es" && it.locale.country.equals("ES", ignoreCase = true) }
            ?.sortedBy { it.name.lowercase(Locale.ROOT) }
            .orEmpty()
        val savedVoiceName = coachVoicePreferences.getString("voice", null)
        val selectedVoice = spanishVoices.firstOrNull { it.name == savedVoiceName }
            ?: spanishVoices.getOrNull(6)
        if (selectedVoice != null) {
            tts.voice = selectedVoice
            coachVoicePreferences.edit().putString("voice", selectedVoice.name).apply()
        } else {
            val language = tts.setLanguage(Locale("es", "ES"))
            if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(Locale("es"))
            }
        }
        tts.setPitch(1.0f)
    }

    private fun speakCoachTextNow(text: String) {
        try {
            coachTts?.setSpeechRate(0.94f)
            coachUtteranceSequence += 1
            val utteranceId = "solido-coach-$coachUtteranceSequence"
            currentCoachUtteranceId = utteranceId
            val result = coachTts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId) ?: TextToSpeech.ERROR
            if (result == TextToSpeech.ERROR) notifyCoachVoiceStatus("unavailable")
        } catch (error: Exception) {
            notifyCoachVoiceStatus("unavailable")
        }
    }

    private fun notifyCoachVoiceStatus(state: String) {
        runOnUiThread {
            if (::web.isInitialized) {
                web.evaluateJavascript("window.onSolidoCoachVoiceStatus && window.onSolidoCoachVoiceStatus('$state')", null)
            }
        }
    }

    @JavascriptInterface
    fun stopCoachSpeech() {
        runOnUiThread {
            pendingCoachSpeech = null
            currentCoachUtteranceId = null
            coachTts?.stop()
            notifyCoachVoiceStatus("stopped")
        }
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
        if (trialExpired) return
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        trialHandler.removeCallbacks(trialCheckRunnable)
        if (::healthConnectBridge.isInitialized) healthConnectBridge.release()
        if (::whc06Bridge.isInitialized) whc06Bridge.release()
        coachTts?.stop()
        coachTts?.shutdown()
        coachTts = null
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }
}
