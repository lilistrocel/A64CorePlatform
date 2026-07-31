/**
 * IndustryDashboard
 *
 * Routes /dashboard to the dashboard that matches the current division's
 * industry.
 *
 * Previously /dashboard always rendered the farm dashboard — "Farm Overview",
 * blocks, crops, yield — while sitting in SHARED_NAV_ITEMS, so it was shown to
 * every industry. A mushroom division therefore opened onto a vegetable
 * dashboard, with the real mushroom one hidden behind a second nav entry.
 *
 * Switching division already clears the query cache (division.store), so the
 * problem was never stale data: the page itself was industry-blind.
 */

import { lazy, Suspense } from 'react';
import styled from 'styled-components';
import { useDivisionStore } from '../../stores/division.store';

const FarmDashboard = lazy(() =>
  import('./Dashboard').then((m) => ({ default: m.Dashboard }))
);
const MushroomDashboard = lazy(() =>
  import('../mushroom/MushroomDashboardPage').then((m) => ({
    default: m.MushroomDashboardPage,
  }))
);

// Night Observatory (T-901): no background here — this fallback mounts
// directly over the app shell's fixed Sky layer while the industry dashboard
// chunk loads, so it must stay transparent rather than paint over it.
const Loading = styled.div`
  padding: 48px 24px;
  text-align: center;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;

export function IndustryDashboard() {
  const currentDivision = useDivisionStore((s) => s.currentDivision);
  const industry = currentDivision?.industryType;

  // Vegetable/fruits is the fallback rather than an error case: divisions
  // created before industry typing, and any industry without a bespoke
  // dashboard, still get the farm view they had before.
  const Chosen = industry === 'mushroom' ? MushroomDashboard : FarmDashboard;

  return (
    <Suspense fallback={<Loading>Loading dashboard…</Loading>}>
      <Chosen />
    </Suspense>
  );
}
