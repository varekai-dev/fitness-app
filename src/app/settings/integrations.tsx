import { HealthCard } from '@/components/health-card';
import { Screen, Text } from '@/components/ui';
import { tr } from '@/lib/i18n';

/** Not linked on web: Health Connect and HealthKit are phone-only. */
export default function IntegrationsScreen() {
  return (
    <Screen title={tr('Інтеграції', 'Integrations')}>
      <Text variant="overline">{tr('Здоров’я', 'Health')}</Text>
      <HealthCard />
    </Screen>
  );
}
