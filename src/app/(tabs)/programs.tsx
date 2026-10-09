import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Field, Loading, Row, Screen, Text } from '@/components/ui';
import { createProgram, listPrograms } from '@/db/programs';
import { useDbQuery } from '@/hooks/use-db-query';
import { colors, spacing } from '@/theme';

export default function ProgramsScreen() {
  const { data } = useDbQuery(listPrograms);
  const [name, setName] = useState('');

  if (!data) return <Loading />;

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = await createProgram(trimmed);
    setName('');
    router.push({ pathname: '/program/[id]', params: { id } });
  };

  return (
    <Screen>
      <Row>
        <Field
          containerStyle={styles.flex}
          value={name}
          onChangeText={setName}
          placeholder="Назва нової програми"
          onSubmitEditing={create}
          returnKeyType="done"
        />
        <Button title="Створити" icon="add" onPress={create} disabled={!name.trim()} />
      </Row>

      {data.length === 0 ? (
        <EmptyState icon="list" title="Програм ще немає" hint="Програма — це набір днів (наприклад, Push / Pull / Legs), які йдуть по колу." />
      ) : (
        data.map((p) => (
          <Card key={p.id} onPress={() => router.push({ pathname: '/program/[id]', params: { id: p.id } })} style={styles.item}>
            <View style={styles.flex}>
              <Text variant="heading">{p.name}</Text>
              <Text variant="caption">{p.days.length} дн.</Text>
            </View>
            {p.isActive && (
              <View style={styles.badge}>
                <Text variant="caption" style={styles.badgeText}>
                  Активна
                </Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { color: colors.accentText, fontWeight: '600' },
});
