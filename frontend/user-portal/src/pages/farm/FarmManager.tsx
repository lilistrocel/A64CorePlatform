/**
 * FarmManager Page
 *
 * Main page component for the Farm Management module.
 * Handles routing between different farm-related views.
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import { FarmDashboard } from '../../components/farm/FarmDashboard';
import { FarmList } from '../../components/farm/FarmList';
import { FarmDetail } from '../../components/farm/FarmDetail';
import { PlantDataLibrary } from './PlantDataLibrary';

export function FarmManager() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="dashboard" replace />} />
      <Route path="/dashboard" element={<FarmDashboard />} />
      <Route path="/farms" element={<FarmList />} />
      <Route path="/farms/:farmId" element={<FarmDetail />} />
      <Route path="/plants" element={<PlantDataLibrary />} />
      <Route path="/plantings" element={<div>Plantings - Coming Soon</div>} />
    </Routes>
  );
}
