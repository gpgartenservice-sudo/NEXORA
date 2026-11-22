import { RoadmapScreen } from '@/features/roadmap/roadmap-screen';
import { AreaGate } from '@/features/team/area-gate';

export default function FahrplanScreen() {
  return (
    <AreaGate area="fahrplan">
      <RoadmapScreen />
    </AreaGate>
  );
}
