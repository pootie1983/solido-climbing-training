
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")

    dependencies {
        implementation("androidx.health.connect:connect-client:1.1.0")
        implementation("androidx.activity:activity-ktx:1.10.1")
    }
}

android {
    namespace = "com.solidoclimbing.training"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.solidoclimbing.training"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}
