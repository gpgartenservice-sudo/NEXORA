import { router, useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';

import { useCrm } from './crm-provider';
import { CustomerForm } from './customer-form';
import { CrmSetupNotice } from './ui';

/** Neuen Kunden anlegen – danach geht es direkt in die Kundenakte. */
export function CustomerNewScreen() {
  const { createCustomer, error } = useCrm();
  const params = useLocalSearchParams<{ name?: string; returnTo?: string }>();

  return (
    <Screen maxWidth={720}>
      <PageHeader
        title="Neuer Kunde"
        subtitle="Kontaktdaten einmal zentral erfassen – Aufträge legst du danach in der Kundenakte an."
        back={{ label: 'Kunden', onPress: () => router.navigate('/kunden') }}
      />
      <CrmSetupNotice error={error} />
      <Reveal delay={250}>
        <Card>
          <CustomerForm
            initial={{ name: params.name ?? '' }}
            submitLabel="Kunde anlegen"
            onSubmit={async (input) => {
              const { data, error: err } = await createCustomer(input);
              if (data) router.replace(`/kunden/${data.id}`);
              return { error: err };
            }}
          />
        </Card>
      </Reveal>
    </Screen>
  );
}
