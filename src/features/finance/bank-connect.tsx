import { Landmark } from 'lucide-react-native';

import { ComingSoonPanel, SoonButton } from '@/components/ui/coming-soon';

/** Knopf "Bank verbinden" – die Funktion kommt noch (Kontoanbindung über einen lizenzierten Anbieter). */
export function BankConnectButton({ open, onPress }: { open: boolean; onPress: () => void }) {
  return <SoonButton icon={Landmark} label="Bank verbinden" open={open} onPress={onPress} />;
}

/** Erklärung, was die Kontoanbindung bringen wird und warum sie sicher ist. */
export function BankComingSoon({ onClose }: { onClose: () => void }) {
  return (
    <ComingSoonPanel
      icon={Landmark}
      title="Bankkonto verbinden"
      intro="Verbinde dein Geschäftskonto – dann musst du vieles nicht mehr selbst eintragen:"
      points={[
        'Bezahlte Rechnungen erkennt Lunaxora automatisch am Zahlungseingang',
        'Abbuchungen werden als Ausgaben vorgeschlagen – mit passender Kategorie',
        'Dein echter Kontostand direkt hier in den Finanzen',
      ]}
      safety="Sicher: Du meldest dich direkt bei deiner Bank an, Lunaxora sieht nie dein Passwort und kann nur lesen – keine Überweisungen."
      onClose={onClose}
    />
  );
}
