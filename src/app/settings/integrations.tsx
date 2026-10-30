import { t } from '@lingui/core/macro';
import { HealthCard } from '@/components/health-card';
import { Screen, Text } from '@/components/ui';

/** Not linked on web: Health Connect and HealthKit are phone-only. */
export default function IntegrationsScreen() {
  return (
    <Screen title={t`Інтеграції`}>
      <Text variant="overline">{t`Здоров’я`}</Text>
      <HealthCard />
    </Screen>
  );
}
