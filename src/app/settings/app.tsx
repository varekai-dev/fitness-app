import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';

import { Card, ChipGroup, Row, Screen, Text } from '@/components/ui';
import { languagePreference, setLanguage, tr, type LanguagePreference } from '@/lib/i18n';
import { setUnitSystem, UNIT_SYSTEMS, unitSystem, type UnitSystem } from '@/lib/units';
import { colors } from '@/theme';

const LANGUAGE_OPTIONS = ['system', 'uk', 'en'] as const;
const LANGUAGE_LABELS: Record<LanguagePreference, string> = {
  system: tr('Як у системі', 'System'),
  // Each language is named in itself, so it can be found from either one.
  uk: 'Українська',
  en: 'English',
};

const UNIT_LABELS: Record<UnitSystem, string> = {
  metric: tr('Метрична', 'Metric'),
  imperial: tr('Імперська', 'Imperial'),
};

const UNIT_HINTS: Record<UnitSystem, string> = {
  metric: tr('кг, км, мл, см', 'kg, km, ml, cm'),
  imperial: tr('фунти, милі, унції, дюйми', 'lb, mi, fl oz, in'),
};

/** App-wide preferences: language and units. */
export default function AppSettingsScreen() {
  return (
    <Screen title={tr('Застосунок', 'App')}>
      <Card>
        <Row>
          <Ionicons name="language-outline" size={20} color={colors.accent} />
          <Text variant="heading">{tr('Мова', 'Language')}</Text>
        </Row>
        <ChipGroup
          options={LANGUAGE_OPTIONS}
          value={languagePreference}
          onChange={(value) => {
            Haptics.selectionAsync();
            setLanguage(value);
          }}
          labels={LANGUAGE_LABELS}
        />
      </Card>
      <Card>
        <Row>
          <Ionicons name="speedometer-outline" size={20} color={colors.accent} />
          <Text variant="heading">{tr('Одиниці виміру', 'Units')}</Text>
        </Row>
        <ChipGroup
          options={UNIT_SYSTEMS}
          value={unitSystem}
          onChange={(value) => {
            Haptics.selectionAsync();
            setUnitSystem(value);
          }}
          labels={UNIT_LABELS}
        />
        <Text variant="muted">
          {UNIT_HINTS[unitSystem]}.{' '}
          {tr(
            'Їжа й макроси завжди в грамах, енергія — в ккал.',
            'Food and macros are always in grams, energy in kcal.',
          )}
        </Text>
      </Card>
    </Screen>
  );
}
