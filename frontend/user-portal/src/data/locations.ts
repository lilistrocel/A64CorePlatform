/**
 * locations.ts
 *
 * Cascading location data for GCC/MENA region farm location dropdowns.
 * Structure: countries → states/provinces → cities
 *
 * The sentinel value "Other" is available at each level so users are never
 * blocked if their exact location is not listed.  When "Other" is selected
 * the UI should render a free-text input as a fallback.
 */

export const OTHER_VALUE = 'Other';

// ============================================================================
// TYPES
// ============================================================================

export interface CityEntry {
  label: string;
  value: string;
}

export interface StateEntry {
  label: string;
  value: string;
  cities: CityEntry[];
}

export interface CountryEntry {
  label: string;
  value: string;
  states: StateEntry[];
}

// ============================================================================
// LOCATION DATA
// ============================================================================

export const LOCATIONS: CountryEntry[] = [
  {
    label: 'United Arab Emirates',
    value: 'UAE',
    states: [
      {
        label: 'Abu Dhabi',
        value: 'Abu Dhabi',
        cities: [
          { label: 'Abu Dhabi', value: 'Abu Dhabi' },
          { label: 'Al Ain', value: 'Al Ain' },
          { label: 'Al Dhafra', value: 'Al Dhafra' },
          { label: 'Liwa', value: 'Liwa' },
          { label: 'Madinat Zayed', value: 'Madinat Zayed' },
          { label: 'Ruwais', value: 'Ruwais' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Dubai',
        value: 'Dubai',
        cities: [
          { label: 'Dubai', value: 'Dubai' },
          { label: 'Jebel Ali', value: 'Jebel Ali' },
          { label: 'Al Quoz', value: 'Al Quoz' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Sharjah',
        value: 'Sharjah',
        cities: [
          { label: 'Sharjah', value: 'Sharjah' },
          { label: 'Khor Fakkan', value: 'Khor Fakkan' },
          { label: 'Kalba', value: 'Kalba' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Ajman',
        value: 'Ajman',
        cities: [
          { label: 'Ajman', value: 'Ajman' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Umm Al Quwain',
        value: 'Umm Al Quwain',
        cities: [
          { label: 'Umm Al Quwain', value: 'Umm Al Quwain' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Ras Al Khaimah',
        value: 'Ras Al Khaimah',
        cities: [
          { label: 'Ras Al Khaimah', value: 'Ras Al Khaimah' },
          { label: 'Al Rams', value: 'Al Rams' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Fujairah',
        value: 'Fujairah',
        cities: [
          { label: 'Fujairah', value: 'Fujairah' },
          { label: 'Dibba Al Fujairah', value: 'Dibba Al Fujairah' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: OTHER_VALUE,
        value: OTHER_VALUE,
        cities: [{ label: OTHER_VALUE, value: OTHER_VALUE }],
      },
    ],
  },
  {
    label: 'Saudi Arabia',
    value: 'Saudi Arabia',
    states: [
      {
        label: 'Riyadh',
        value: 'Riyadh',
        cities: [
          { label: 'Riyadh', value: 'Riyadh' },
          { label: 'Al Kharj', value: 'Al Kharj' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Makkah',
        value: 'Makkah',
        cities: [
          { label: 'Jeddah', value: 'Jeddah' },
          { label: 'Makkah', value: 'Makkah' },
          { label: 'Taif', value: 'Taif' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Eastern Province',
        value: 'Eastern Province',
        cities: [
          { label: 'Dammam', value: 'Dammam' },
          { label: 'Al Khobar', value: 'Al Khobar' },
          { label: 'Al Ahsa', value: 'Al Ahsa' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Medina',
        value: 'Medina',
        cities: [
          { label: 'Medina', value: 'Medina' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Asir',
        value: 'Asir',
        cities: [
          { label: 'Abha', value: 'Abha' },
          { label: 'Khamis Mushait', value: 'Khamis Mushait' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: OTHER_VALUE,
        value: OTHER_VALUE,
        cities: [{ label: OTHER_VALUE, value: OTHER_VALUE }],
      },
    ],
  },
  {
    label: 'Oman',
    value: 'Oman',
    states: [
      {
        label: 'Muscat',
        value: 'Muscat',
        cities: [
          { label: 'Muscat', value: 'Muscat' },
          { label: 'Seeb', value: 'Seeb' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Dhofar',
        value: 'Dhofar',
        cities: [
          { label: 'Salalah', value: 'Salalah' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Al Batinah North',
        value: 'Al Batinah North',
        cities: [
          { label: 'Sohar', value: 'Sohar' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Al Dakhiliyah',
        value: 'Al Dakhiliyah',
        cities: [
          { label: 'Nizwa', value: 'Nizwa' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: OTHER_VALUE,
        value: OTHER_VALUE,
        cities: [{ label: OTHER_VALUE, value: OTHER_VALUE }],
      },
    ],
  },
  {
    label: 'Bahrain',
    value: 'Bahrain',
    states: [
      {
        label: 'Capital',
        value: 'Capital',
        cities: [
          { label: 'Manama', value: 'Manama' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Northern',
        value: 'Northern',
        cities: [
          { label: 'Muharraq', value: 'Muharraq' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Southern',
        value: 'Southern',
        cities: [
          { label: 'Riffa', value: 'Riffa' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: OTHER_VALUE,
        value: OTHER_VALUE,
        cities: [{ label: OTHER_VALUE, value: OTHER_VALUE }],
      },
    ],
  },
  {
    label: 'Kuwait',
    value: 'Kuwait',
    states: [
      {
        label: 'Al Asimah',
        value: 'Al Asimah',
        cities: [
          { label: 'Kuwait City', value: 'Kuwait City' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Hawalli',
        value: 'Hawalli',
        cities: [
          { label: 'Hawalli', value: 'Hawalli' },
          { label: 'Salmiya', value: 'Salmiya' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Al Ahmadi',
        value: 'Al Ahmadi',
        cities: [
          { label: 'Ahmadi', value: 'Ahmadi' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: OTHER_VALUE,
        value: OTHER_VALUE,
        cities: [{ label: OTHER_VALUE, value: OTHER_VALUE }],
      },
    ],
  },
  {
    label: 'Qatar',
    value: 'Qatar',
    states: [
      {
        label: 'Ad Dawhah',
        value: 'Ad Dawhah',
        cities: [
          { label: 'Doha', value: 'Doha' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Al Rayyan',
        value: 'Al Rayyan',
        cities: [
          { label: 'Al Rayyan', value: 'Al Rayyan' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Al Wakrah',
        value: 'Al Wakrah',
        cities: [
          { label: 'Al Wakrah', value: 'Al Wakrah' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: OTHER_VALUE,
        value: OTHER_VALUE,
        cities: [{ label: OTHER_VALUE, value: OTHER_VALUE }],
      },
    ],
  },
  {
    label: 'Jordan',
    value: 'Jordan',
    states: [
      {
        label: 'Amman',
        value: 'Amman',
        cities: [
          { label: 'Amman', value: 'Amman' },
          { label: 'Zarqa', value: 'Zarqa' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Irbid',
        value: 'Irbid',
        cities: [
          { label: 'Irbid', value: 'Irbid' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Aqaba',
        value: 'Aqaba',
        cities: [
          { label: 'Aqaba', value: 'Aqaba' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Mafraq',
        value: 'Mafraq',
        cities: [
          { label: 'Mafraq', value: 'Mafraq' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: OTHER_VALUE,
        value: OTHER_VALUE,
        cities: [{ label: OTHER_VALUE, value: OTHER_VALUE }],
      },
    ],
  },
  {
    label: 'Egypt',
    value: 'Egypt',
    states: [
      {
        label: 'Cairo',
        value: 'Cairo',
        cities: [
          { label: 'Cairo', value: 'Cairo' },
          { label: 'Heliopolis', value: 'Heliopolis' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Giza',
        value: 'Giza',
        cities: [
          { label: 'Giza', value: 'Giza' },
          { label: '6th of October City', value: '6th of October City' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Alexandria',
        value: 'Alexandria',
        cities: [
          { label: 'Alexandria', value: 'Alexandria' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: 'Sinai',
        value: 'Sinai',
        cities: [
          { label: 'Arish', value: 'Arish' },
          { label: 'Sharm El Sheikh', value: 'Sharm El Sheikh' },
          { label: OTHER_VALUE, value: OTHER_VALUE },
        ],
      },
      {
        label: OTHER_VALUE,
        value: OTHER_VALUE,
        cities: [{ label: OTHER_VALUE, value: OTHER_VALUE }],
      },
    ],
  },
  {
    label: OTHER_VALUE,
    value: OTHER_VALUE,
    states: [
      {
        label: OTHER_VALUE,
        value: OTHER_VALUE,
        cities: [{ label: OTHER_VALUE, value: OTHER_VALUE }],
      },
    ],
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Returns the states for a given country value, or an empty array. */
export function getStatesForCountry(countryValue: string): StateEntry[] {
  const country = LOCATIONS.find((c) => c.value === countryValue);
  return country ? country.states : [];
}

/** Returns the cities for a given country and state value, or an empty array. */
export function getCitiesForState(countryValue: string, stateValue: string): CityEntry[] {
  const states = getStatesForCountry(countryValue);
  const state = states.find((s) => s.value === stateValue);
  return state ? state.cities : [];
}

/**
 * Resolves the dropdown value for a stored string.
 * If the string matches one of the known values it is returned as-is.
 * Otherwise "Other" is returned so the free-text fallback is shown,
 * and the raw string can be pre-filled into that fallback input.
 */
export function resolveDropdownValue(
  knownValues: string[],
  storedValue: string | undefined | null,
): string {
  if (!storedValue) return '';
  if (knownValues.includes(storedValue)) return storedValue;
  return OTHER_VALUE;
}
