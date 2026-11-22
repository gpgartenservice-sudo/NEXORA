import { NexyScreen } from '@/features/assistant/nexy-screen';
import { AreaGate } from '@/features/team/area-gate';

export default function AssistentScreen() {
  return (
    <AreaGate area="luna">
      <NexyScreen />
    </AreaGate>
  );
}
