package expo.modules.homewidget

import android.content.Context
import org.json.JSONObject
import java.util.Calendar

/** One of today's totals, already formatted by the app in its language and units. */
internal data class Metric(
  val label: String,
  val value: String,
  val total: String,
  val progress: Double,
  val over: Boolean,
  val url: String,
)

internal data class Workout(
  val label: String,
  val title: String,
  val subtitle: String,
  val url: String,
)

/**
 * What the widgets show, as last sent by the app (`src/lib/home-widget.ts`).
 * `day` is the local midnight the totals belong to.
 */
internal data class WidgetData(
  val day: Long,
  val water: Metric,
  val calories: Metric,
  val workout: Workout,
) {
  /** After midnight nothing is drunk or eaten yet, even if the app hasn't been opened since. */
  fun forToday(): WidgetData {
    if (day >= startOfToday()) return this
    val reset = { m: Metric -> m.copy(value = "0", progress = 0.0, over = false) }
    return copy(water = reset(water), calories = reset(calories))
  }
}

internal object WidgetStore {
  private const val PREFS = "fitness_home_widget"
  private const val KEY = "data"

  fun save(context: Context, json: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
  }

  fun load(context: Context): WidgetData? {
    val json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
      ?: return null
    return runCatching { parse(JSONObject(json)) }.getOrNull()
  }

  private fun parse(json: JSONObject) = WidgetData(
    day = json.getLong("day"),
    water = metric(json.getJSONObject("water")),
    calories = metric(json.getJSONObject("calories")),
    workout = json.getJSONObject("workout").let {
      Workout(
        label = it.getString("label"),
        title = it.getString("title"),
        subtitle = it.getString("subtitle"),
        url = it.getString("url"),
      )
    },
  )

  private fun metric(json: JSONObject) = Metric(
    label = json.getString("label"),
    value = json.getString("value"),
    total = json.getString("total"),
    progress = json.getDouble("progress"),
    over = json.optBoolean("over"),
    url = json.getString("url"),
  )
}

/** Local midnight of today, or of a day `plusDays` away (by the calendar, so DST days count right). */
internal fun startOfToday(plusDays: Int = 0): Long = Calendar.getInstance().apply {
  add(Calendar.DAY_OF_YEAR, plusDays)
  set(Calendar.HOUR_OF_DAY, 0)
  set(Calendar.MINUTE, 0)
  set(Calendar.SECOND, 0)
  set(Calendar.MILLISECOND, 0)
}.timeInMillis
