import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { Loading, Screen, Text } from '@/components/ui';
import { loadDemoData } from '@/db/demo-data';

/**
 * Development only: fills the logs with demo data for store screenshots, then
 * goes home. Open it with `exp://<host>:<port>/--/demo-data`. In a release
 * build it just goes home.
 */
export default function DemoDataScreen() {
  const [state, setState] = useState<'loading' | 'done' | Error>(__DEV__ ? 'loading' : 'done');

  useEffect(() => {
    if (!__DEV__) return;
    loadDemoData().then(
      () => setState('done'),
      (e: Error) => setState(e),
    );
  }, []);

  if (state === 'done') return <Redirect href="/" />;
  return (
    <Screen title="Demo data">
      {state === 'loading' ? <Loading /> : <Text variant="body">{state.message}</Text>}
    </Screen>
  );
}
