package expo.modules.homewidget

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HomeWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HomeWidget")

    /** Stores what the widgets show (JSON, see `WidgetData`) and redraws the placed ones. */
    Function("update") { json: String ->
      appContext.reactContext?.let { context ->
        WidgetStore.save(context, json)
        FitnessWidget.updateAll(context)
      }
    }
  }
}
