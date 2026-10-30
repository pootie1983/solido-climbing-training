package com.solidoclimbing.training

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.widget.TextView

/**
 * Explica por qué SOLIDO CLIMBING solicita acceso de lectura a Health Connect.
 * Android puede abrir esta pantalla desde el gestor de permisos de salud.
 */
class PermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val message = TextView(this).apply {
            text = "SOLIDO CLIMBING\n\nLa aplicación solicita permiso de lectura para mostrar tus pasos, distancia, calorías activas, pulso y sueño sincronizados con Health Connect.\n\nEstos datos se utilizan únicamente para mostrar tus métricas de actividad dentro de la aplicación."
            textSize = 18f
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
        }
        setContentView(message)
    }
}
