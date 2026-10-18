package expo.modules.homewidget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.widget.RemoteViews

/** The view ids of one metric cell; the same ids in every layout that shows it. */
private class MetricViews(
  val cell: Int,
  val label: Int,
  val value: Int,
  val total: Int,
  val progress: Int,
  val note: Int,
)

private val WATER = MetricViews(
  R.id.water_cell, R.id.water_label, R.id.water_value, R.id.water_total, R.id.water_progress,
  R.id.water_note,
)
private val CALORIES = MetricViews(
  R.id.calories_cell, R.id.calories_label, R.id.calories_value, R.id.calories_total,
  R.id.calories_progress, R.id.calories_note,
)

/** From this height (dp) the widget has room for [FitnessWidget]'s medium layout: about one cell. */
private const val MEDIUM_HEIGHT = 72f

/** From this height (dp) the widget shows its full layout: about two cells. */
private const val FULL_HEIGHT = 140f

/** Which single-number widget a [FitnessWidget] is, if any. */
enum class StatKind { WEIGHT, WEEK }

/**
 * A home screen widget showing some of today's water, calories and next workout,
 * or one stat (body weight, this week's workouts).
 * The app pushes the data; the widget never reads the database itself.
 * [compactLayout] has the same ids minus the ones a single row has no room for;
 * [mediumLayout], if any, fits more of them into one row of home screen cells.
 */
abstract class FitnessWidget(
  private val layout: Int,
  private val compactLayout: Int,
  private val mediumLayout: Int? = null,
  private val water: Boolean = false,
  private val calories: Boolean = false,
  private val workout: Boolean = false,
  private val stat: StatKind? = null,
) : AppWidgetProvider() {

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    render(context, manager, ids)
    MidnightReceiver.schedule(context)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    manager: AppWidgetManager,
    id: Int,
    options: Bundle,
  ) {
    render(context, manager, intArrayOf(id))
  }

  override fun onDisabled(context: Context) {
    MidnightReceiver.schedule(context)
  }

  internal fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val data = WidgetStore.load(context)?.forToday()
    val viewsFor = { layout: Int -> build(context, layout, data) }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      // The launcher picks the layout for the current size itself, also mid-resize.
      val sizes = buildMap {
        put(SizeF(0f, 0f), viewsFor(compactLayout))
        if (mediumLayout != null) put(SizeF(0f, MEDIUM_HEIGHT), viewsFor(mediumLayout))
        put(SizeF(0f, FULL_HEIGHT), viewsFor(layout))
      }
      manager.updateAppWidget(ids, RemoteViews(sizes))
      return
    }
    for (id in ids) {
      // Portrait phones show the widget at its max height.
      val height = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)
      val chosen = when {
        height <= 0 || height >= FULL_HEIGHT -> layout
        height >= MEDIUM_HEIGHT && mediumLayout != null -> mediumLayout
        else -> compactLayout
      }
      manager.updateAppWidget(id, viewsFor(chosen))
    }
  }

  private fun build(context: Context, layout: Int, data: WidgetData?): RemoteViews {
    val views = RemoteViews(context.packageName, layout)
    if (water) bindMetric(context, views, WATER, data?.water, R.string.widget_water, 1)
    if (calories) bindMetric(context, views, CALORIES, data?.calories, R.string.widget_calories, 2)
    if (workout) bindWorkout(context, views, data?.workout)
    when (stat) {
      StatKind.WEIGHT -> bindStat(context, views, data?.weight, R.string.widget_weight, 4)
      StatKind.WEEK -> bindStat(context, views, data?.week, R.string.widget_week, 5)
      null -> {}
    }
    return views
  }

  private fun bindStat(
    context: Context,
    views: RemoteViews,
    stat: Stat?,
    fallbackLabel: Int,
    requestCode: Int,
  ) {
    views.setTextViewText(R.id.stat_label, stat?.label ?: context.getString(fallbackLabel))
    views.setTextViewText(R.id.stat_value, stat?.value ?: "—")
    views.setTextViewText(R.id.stat_unit, stat?.unit ?: "")
    views.setTextViewText(
      R.id.stat_subtitle,
      stat?.subtitle ?: context.getString(R.string.widget_open_app),
    )
    views.setOnClickPendingIntent(R.id.stat_cell, openApp(context, stat?.url, requestCode))
  }

  private fun bindMetric(
    context: Context,
    views: RemoteViews,
    ids: MetricViews,
    metric: Metric?,
    fallbackLabel: Int,
    requestCode: Int,
  ) {
    views.setTextViewText(ids.label, metric?.label ?: context.getString(fallbackLabel))
    views.setTextViewText(ids.value, metric?.value ?: "—")
    views.setTextViewText(ids.total, metric?.total ?: context.getString(R.string.widget_open_app))
    views.setTextViewText(ids.note, metric?.note ?: "")
    val color = if (metric?.over == true) R.color.widget_warning else R.color.widget_text
    views.setTextColor(ids.value, context.getColor(color))
    val progress = ((metric?.progress ?: 0.0).coerceIn(0.0, 1.0) * 1000).toInt()
    views.setProgressBar(ids.progress, 1000, progress, false)
    views.setOnClickPendingIntent(ids.cell, openApp(context, metric?.url, requestCode))
  }

  private fun bindWorkout(context: Context, views: RemoteViews, workout: Workout?) {
    views.setTextViewText(
      R.id.workout_label,
      workout?.label ?: context.getString(R.string.widget_next_workout),
    )
    views.setTextViewText(
      R.id.workout_title,
      workout?.title ?: context.getString(R.string.widget_open_app),
    )
    views.setTextViewText(R.id.workout_subtitle, workout?.subtitle ?: "")
    views.setOnClickPendingIntent(R.id.workout_cell, openApp(context, workout?.url, 3))
  }

  private fun openApp(context: Context, url: String?, requestCode: Int): PendingIntent {
    val intent = if (url != null) {
      Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(context.packageName)
    } else {
      context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  companion object {
    private val providers = listOf(
      TodayWidget::class.java,
      WaterWidget::class.java,
      CaloriesWidget::class.java,
      WorkoutWidget::class.java,
      WeightWidget::class.java,
      WeekWidget::class.java,
    )

    /** Ids of every placed widget of each kind; empty when none is on the home screen. */
    internal fun placed(context: Context): List<Pair<FitnessWidget, IntArray>> {
      val manager = AppWidgetManager.getInstance(context)
      return providers.mapNotNull { provider ->
        val ids = manager.getAppWidgetIds(ComponentName(context, provider))
        if (ids.isEmpty()) null else provider.getDeclaredConstructor().newInstance() to ids
      }
    }

    /** Redraws every placed widget from the stored data. */
    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      for ((widget, ids) in placed(context)) widget.render(context, manager, ids)
      MidnightReceiver.schedule(context)
    }
  }
}

class TodayWidget : FitnessWidget(
  R.layout.widget_today,
  R.layout.widget_today_compact,
  R.layout.widget_today_medium,
  water = true,
  calories = true,
  workout = true,
)

class WaterWidget : FitnessWidget(R.layout.widget_water, R.layout.widget_water_compact, water = true)

class CaloriesWidget :
  FitnessWidget(R.layout.widget_calories, R.layout.widget_calories_compact, calories = true)

class WorkoutWidget :
  FitnessWidget(R.layout.widget_workout, R.layout.widget_workout_compact, workout = true)

class WeightWidget :
  FitnessWidget(R.layout.widget_weight, R.layout.widget_weight_compact, stat = StatKind.WEIGHT)

class WeekWidget :
  FitnessWidget(R.layout.widget_week, R.layout.widget_week_compact, stat = StatKind.WEEK)

/**
 * Resets today's totals at midnight, when the app may not run for hours. The alarm
 * doesn't wake the device: a widget nobody can see needn't change until the screen is on.
 */
class MidnightReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    FitnessWidget.updateAll(context)
  }

  companion object {
    /** Sets the alarm for the next midnight while any widget is placed, and clears it otherwise. */
    fun schedule(context: Context) {
      val alarms = context.getSystemService(AlarmManager::class.java) ?: return
      val pending = PendingIntent.getBroadcast(
        context,
        0,
        Intent(context, MidnightReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      if (FitnessWidget.placed(context).isEmpty()) {
        alarms.cancel(pending)
        return
      }
      // A few seconds past midnight, so the new day has surely begun.
      val next = startOfToday(plusDays = 1) + 5_000
      alarms.set(AlarmManager.RTC, next, pending)
    }
  }
}
