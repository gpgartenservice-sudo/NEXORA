import { CompanyScreen } from '@/features/documents/company-screen';
import { AreaGate } from '@/features/team/area-gate';

export default function FirmaScreen() {
  return (
    <AreaGate area="firma">
      <CompanyScreen />
    </AreaGate>
  );
}
