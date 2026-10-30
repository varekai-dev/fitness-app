import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ModuleSettings } from '@/components/module-settings';
import { Card, ChipGroup, Row, Screen, Text } from '@/components/ui';
import { languagePreference, setLanguage, type LanguagePreference } from '@/lib/i18n';
import { setUnitSystem, UNIT_SYSTEMS, unitSystem, type UnitSystem } from '@/lib/units';
import { colors } from '@/theme';

const LANGUAGE_OPTIONS = ['system', 'uk', 'en'] as const;
const LANGUAGE_LABELS: Record<LanguagePreference, string> = {
  system: t`Як у системі`,
  // Each language is named in itself, so it can be found from either one.
  uk: 'Українська',
  en: 'English',
};

const UNIT_LABELS: Record<UnitSystem, string> = {
  metric: t`Метрична`,
  imperial: t`Імперська`,
};

const UNIT_HINTS: Record<UnitSystem, string> = {
  metric: t`кг, км, мл, см`,
  imperial: t`фунти, милі, унції, дюйми`,
};

/** App-wide preferences: language, units and which sections the app has. */
export default function AppSettingsScreen() {
  return (
    <Screen title={t`Застосунок`}>
      <Card>
        <Row>
          <Ionicons name="language-outline" size={20} color={colors.accent} />
          <Text variant="heading">{t`Мова`}</Text>
        </Row>
        <ChipGroup
          options={LANGUAGE_OPTIONS}
          value={languagePreference}
          onChange={(value) => {
            setLanguage(value);
          }}
          labels={LANGUAGE_LABELS}
        />
      </Card>
      <Card>
        <Row>
          <Ionicons name="speedometer-outline" size={20} color={colors.accent} />
          <Text variant="heading">{t`Одиниці виміру`}</Text>
        </Row>
        <ChipGroup
          options={UNIT_SYSTEMS}
          value={unitSystem}
          onChange={(value) => {
            setUnitSystem(value);
          }}
          labels={UNIT_LABELS}
        />
        <Text variant="muted">
          {UNIT_HINTS[unitSystem]}.{' '}
          {t`Їжа й макроси завжди в грамах, енергія — в ккал.`}
        </Text>
      </Card>
      <ModuleSettings />
    </Screen>
  );
}
