import { readSettingSync, reloadApp, writeSettingSync } from '@/lib/app-settings';
import { locale, tr } from '@/lib/i18n';

/**
 * Data is always stored in metric (kg, km, ml, cm); the chosen system only
 * changes what is shown and how typed values are read back.
 */
export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

const KEY = 'unit_system';

/** Resolved once at startup like the language, so changing it reloads the app. */
export const unitSystem: UnitSystem = readSettingSync(KEY) === 'imperial' ? 'imperial' : 'metric';
const imperial = unitSystem === 'imperial';

export async function setUnitSystem(system: UnitSystem) {
  if (system === unitSystem) return;
  writeSettingSync(KEY, system === 'metric' ? null : system);
  await reloadApp('Units changed');
}

const KG_PER_LB = 0.45359237;
const KM_PER_MI = 1.609344;
const ML_PER_FL_OZ = 29.5735;
const CM_PER_IN = 2.54;

// ---------- weight ----------

export const WEIGHT_UNIT = imperial ? tr('фн', 'lb') : tr('кг', 'kg');
export const kgToDisplay = (kg: number) => (imperial ? kg / KG_PER_LB : kg);
export const displayToKg = (v: number) => (imperial ? v * KG_PER_LB : v);

// ---------- distance ----------

export const DISTANCE_UNIT = imperial ? tr('мі', 'mi') : tr('км', 'km');
export const kmToDisplay = (km: number) => (imperial ? km / KM_PER_MI : km);
export const displayToKm = (v: number) => (imperial ? v * KM_PER_MI : v);

// ---------- volume ----------

export const VOLUME_UNIT = imperial ? tr('унц', 'fl oz') : tr('мл', 'ml');
export const mlToDisplay = (ml: number) => (imperial ? ml / ML_PER_FL_OZ : ml);
/** Water is stored in whole millilitres. */
export const displayToMl = (v: number) => Math.round(imperial ? v * ML_PER_FL_OZ : v);
/** Fluid ounces to millilitres, for presets defined in ounces. */
export const flOz = (oz: number) => Math.round(oz * ML_PER_FL_OZ);

const groupedFormatter = new Intl.NumberFormat(locale);
const compactFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

/** "1 800" ml or "61" fl oz, grouped like the rest of the UI, without the unit. */
export const formatVolume = (ml: number) => groupedFormatter.format(Math.round(mlToDisplay(ml)));

/** "1,8 л" or "61 fl oz" for compact labels such as chart bars. */
export const formatVolumeCompact = (ml: number) =>
  imperial
    ? `${formatVolume(ml)} ${VOLUME_UNIT}`
    : `${compactFormatter.format(ml / 1000)} ${tr('л', 'L')}`;

// ---------- height ----------

export const HEIGHT_UNIT = imperial ? tr('дюйм', 'in') : tr('см', 'cm');
export const cmToDisplay = (cm: number) => (imperial ? cm / CM_PER_IN : cm);
export const displayToCm = (v: number) => (imperial ? v * CM_PER_IN : v);
