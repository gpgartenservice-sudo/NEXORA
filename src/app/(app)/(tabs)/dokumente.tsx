import { GateNotice } from '@/features/team/area-gate';
import { useAccess, useWorkspaceId } from '@/features/team/team-provider';
import { VaultScreen } from '@/features/vault/vault-screen';

/** Dokumente der Firma – nur Inhaber und Mitgründer (Mitarbeiter auch nicht mit Rechten) */
export default function DokumenteScreen() {
  const { employer } = useAccess();
  // Dokumente der offenen Firma (im Team: der Firma des Inhabers)
  const companyId = useWorkspaceId();
  if (!employer) {
    return (
      <GateNotice
        title="Nur für Inhaber und Mitgründer"
        text="Hier liegen die Unterlagen der Firma – Gewerbeanmeldung, ELSTER-Zertifikat, Versicherungen und Verträge. Die sehen nur Inhaber und Mitgründer."
      />
    );
  }
  return <VaultScreen companyId={companyId} />;
}
