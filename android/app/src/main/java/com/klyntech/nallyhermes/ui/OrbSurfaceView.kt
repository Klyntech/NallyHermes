package com.klyntech.nallyhermes.ui

import android.content.Context
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.graphics.PixelFormat
import android.os.SystemClock
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.atomic.AtomicReference
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.max

/**
 * Native OpenGL ES port of the exact fragment shader and state palette in
 * voice-miniapp-mockup-4.html. No WebView and no rasterized approximation.
 */
class OrbSurfaceView(context: Context) : GLSurfaceView(context) {
    private val orbRenderer = OrbRenderer()

    init {
        setEGLContextClientVersion(2)
        setEGLConfigChooser(8, 8, 8, 8, 0, 0)
        holder.setFormat(PixelFormat.TRANSLUCENT)
        setZOrderMediaOverlay(true)
        setRenderer(orbRenderer)
        renderMode = RENDERMODE_CONTINUOUSLY
    }

    fun setVoiceUiState(state: VoiceUiState) {
        orbRenderer.setState(state)
    }

    fun setAudioLevel(value: Float) {
        orbRenderer.setLevel(value.coerceIn(0f, 1f))
    }

    private data class Params(
        val tint: FloatArray, val deep: FloatArray,
        val speed: Float, val energy: Float, val dim: Float
    )

    private class OrbRenderer : Renderer {
        private val stateRef = AtomicReference("ready")
        private var current = params("ready")
        private var target = params("ready")
        private var program = 0
        private var started = 0L
        private var width = 1
        private var height = 1
        private var pulse = 0f
        @Volatile private var level = 0f
        private lateinit var vertices: FloatBuffer
        private var aPos = 0
        private var uRes = 0
        private var uTime = 0
        private var uLevel = 0
        private var uSpeed = 0
        private var uEnergy = 0
        private var uDim = 0
        private var uPulse = 0
        private var uTint = 0
        private var uDeep = 0

        fun setLevel(value: Float) { level = value }

        fun setState(state: VoiceUiState) {
            val key = when (state) {
                VoiceUiState.Ready -> "ready"
                VoiceUiState.Connecting -> "connecting"
                VoiceUiState.Listening -> "listening"
                VoiceUiState.Thinking -> "thinking"
                VoiceUiState.Tool -> "tool"
                VoiceUiState.Speaking -> "speaking"
                VoiceUiState.Interrupted -> "interrupted"
                VoiceUiState.Reconnecting -> "reconnecting"
                VoiceUiState.Denied -> "denied"
                VoiceUiState.Ended -> "ended"
            }
            stateRef.set(key)
        }

        override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
            started = SystemClock.elapsedRealtime()
            GLES20.glClearColor(0f, 0f, 0f, 0f)
            GLES20.glEnable(GLES20.GL_BLEND)
            GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE_MINUS_SRC_ALPHA)
            val vs = compile(GLES20.GL_VERTEX_SHADER, VERTEX_SHADER)
            val fs = compile(GLES20.GL_FRAGMENT_SHADER, FRAGMENT_SHADER)
            program = GLES20.glCreateProgram()
            GLES20.glAttachShader(program, vs)
            GLES20.glAttachShader(program, fs)
            GLES20.glLinkProgram(program)
            val linked = IntArray(1)
            GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linked, 0)
            if (linked[0] == 0) throw IllegalStateException("Orb shader link failed: " + GLES20.glGetProgramInfoLog(program))
            GLES20.glUseProgram(program)
            vertices = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
            vertices.put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)).position(0)
            aPos = GLES20.glGetAttribLocation(program, "a")
            uRes = GLES20.glGetUniformLocation(program, "uRes")
            uTime = GLES20.glGetUniformLocation(program, "uTime")
            uLevel = GLES20.glGetUniformLocation(program, "uLevel")
            uSpeed = GLES20.glGetUniformLocation(program, "uSpeed")
            uEnergy = GLES20.glGetUniformLocation(program, "uEnergy")
            uDim = GLES20.glGetUniformLocation(program, "uDim")
            uPulse = GLES20.glGetUniformLocation(program, "uPulse")
            uTint = GLES20.glGetUniformLocation(program, "uTint")
            uDeep = GLES20.glGetUniformLocation(program, "uDeep")
        }

        override fun onSurfaceChanged(gl: GL10?, w: Int, h: Int) {
            width = max(1, w); height = max(1, h)
            GLES20.glViewport(0, 0, width, height)
        }

        override fun onDrawFrame(gl: GL10?) {
            val newKey = stateRef.get()
            if (newKey != lastKey) {
                lastKey = newKey
                target = params(newKey)
                pulse = 1f
            }
            val k = 0.07f
            for (i in 0..2) {
                current.tint[i] += (target.tint[i] - current.tint[i]) * k
                current.deep[i] += (target.deep[i] - current.deep[i]) * k
            }
            current = current.copy(
                speed = current.speed + (target.speed - current.speed) * k,
                energy = current.energy + (target.energy - current.energy) * k,
                dim = current.dim + (target.dim - current.dim) * k
            )
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
            GLES20.glUseProgram(program)
            GLES20.glUniform2f(uRes, width.toFloat(), height.toFloat())
            GLES20.glUniform1f(uTime, (SystemClock.elapsedRealtime() - started) / 1000f)
            GLES20.glUniform1f(uLevel, level)
            GLES20.glUniform1f(uSpeed, current.speed)
            GLES20.glUniform1f(uEnergy, current.energy)
            GLES20.glUniform1f(uDim, current.dim)
            GLES20.glUniform1f(uPulse, pulse)
            GLES20.glUniform3fv(uTint, 1, current.tint, 0)
            GLES20.glUniform3fv(uDeep, 1, current.deep, 0)
            vertices.position(0)
            GLES20.glEnableVertexAttribArray(aPos)
            GLES20.glVertexAttribPointer(aPos, 2, GLES20.GL_FLOAT, false, 0, vertices)
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
            pulse *= 0.96f
        }

        private var lastKey = "ready"

        private fun compile(type: Int, source: String): Int {
            val shader = GLES20.glCreateShader(type)
            GLES20.glShaderSource(shader, source)
            GLES20.glCompileShader(shader)
            val ok = IntArray(1)
            GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, ok, 0)
            if (ok[0] == 0) throw IllegalStateException("Orb shader compile failed: " + GLES20.glGetShaderInfoLog(shader))
            return shader
        }

        companion object {
            private fun rgb(hex: String): FloatArray {
                val n = hex.removePrefix("#").toLong(16)
                return floatArrayOf(((n shr 16) and 255).toFloat()/255f, ((n shr 8) and 255).toFloat()/255f, (n and 255).toFloat()/255f)
            }
            private fun params(key: String): Params {
                val values = when (key) {
                    "ready" -> arrayOf("#6B7585", "#14171C", .35f, 0f, 1f)
                    "connecting" -> arrayOf("#7A8596", "#14171C", .9f, 0f, .9f)
                    "listening" -> arrayOf("#8FB8D8", "#0E2236", .6f, 1f, 1f)
                    "thinking", "tool" -> arrayOf("#A9A4C9", "#1A1630", 1.4f, .2f, 1f)
                    "speaking" -> arrayOf("#E8B98A", "#2A1A0C", .9f, 1f, 1f)
                    "interrupted" -> arrayOf("#8FB8D8", "#0E2236", 2.2f, 1.2f, 1f)
                    "reconnecting" -> arrayOf("#5C6470", "#131519", .5f, 0f, .7f)
                    else -> arrayOf("#3A4048", "#101216", if (key == "ended") .05f else .1f, 0f, if (key == "ended") 0f else .35f)
                }
                return Params(rgb(values[0] as String), rgb(values[1] as String), values[2] as Float, values[3] as Float, values[4] as Float)
            }

            private const val VERTEX_SHADER = """
                attribute vec2 a;
                void main() { gl_Position = vec4(a, 0.0, 1.0); }
            """

            // Ported directly from the original HTML's WebGL fragment shader.
            private const val FRAGMENT_SHADER = """
                precision highp float;
                uniform vec2 uRes;
                uniform float uTime, uLevel, uSpeed, uEnergy, uDim, uPulse;
                uniform vec3 uTint, uDeep;
                float hash(vec3 p) {
                  p = fract(p * 0.3183099 + vec3(0.1));
                  p *= 17.0;
                  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
                }
                float noise(vec3 x) {
                  vec3 i = floor(x);
                  vec3 f = fract(x);
                  f = f * f * (3.0 - 2.0 * f);
                  float n000 = hash(i);
                  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
                  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
                  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
                  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
                  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
                  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
                  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
                  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
                             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
                }
                float fbm(vec3 p) {
                  float s = 0.0, a = 0.5;
                  for (int i = 0; i < 4; i++) {
                    s += a * noise(p);
                    p *= 2.02;
                    a *= 0.5;
                  }
                  return s;
                }
                void main() {
                  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.x);
                  float R = 0.76;
                  float d = length(p) - R;
                  float inside = 1.0 - smoothstep(-0.006, 0.006, d);
                  float edgeFade = 1.0 - smoothstep(0.55, 0.96, length(p));
                  float ringD = abs(length(p) - (R + (1.0 - uPulse) * 0.22));
                  float ring = smoothstep(0.03, 0.0, ringD) * uPulse * 0.5 * edgeFade;
                  float halo = exp(-max(d, 0.0) * 8.0) * edgeFade * (0.22 + 0.35 * uLevel * uEnergy) * uDim + ring * uDim;
                  vec3 col = vec3(0.0);
                  if (inside > 0.0) {
                    float z = sqrt(max(R * R - dot(p, p), 0.0));
                    vec3 n = normalize(vec3(p, z));
                    float t = uTime * uSpeed;
                    vec3 q = n * 1.8 + vec3(t * 0.25, -t * 0.18, t * 0.12);
                    float f1 = fbm(q);
                    float f2 = fbm(q * 2.3 + vec3(-t * 0.5, t * 0.3, 0.0));
                    float swirl = smoothstep(0.35, 0.75, f1 + (f2 - 0.5) * 0.4 * (0.4 + uLevel * uEnergy));
                    vec3 L = normalize(vec3(-0.5, 0.6, 0.62));
                    float diff = max(dot(n, L), 0.0);
                    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
                    float spec = pow(max(dot(n, H), 0.0), 60.0);
                    float fres = pow(1.0 - n.z, 2.2);
                    vec3 base = mix(uDeep, uTint, swirl);
                    float glow = 0.9 + uLevel * uEnergy * 0.9;
                    col = base * (0.18 + 0.9 * diff) * glow + uTint * fres * (0.55 + 0.5 * uLevel * uEnergy) + vec3(spec) * 0.75;
                    col *= uDim * inside * (1.0 + uPulse * 0.35);
                  }
                  float a = clamp(inside + halo, 0.0, 1.0);
                  vec3 rgb = col + uTint * halo * (1.0 - inside);
                  gl_FragColor = vec4(min(rgb, vec3(a)), a);
                }
            """
        }
    }
}
