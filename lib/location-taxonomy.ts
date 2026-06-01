// lib/location-taxonomy.ts
// ─────────────────────────────────────────────────────────────────────────────
// MANOP Canonical Location Taxonomy
//
// This is the backbone of the neighborhood intelligence model.
// Every listing must resolve to a location in this tree.
// Clean structured location data → clean benchmarks → real intelligence.
//
// LEVEL STRUCTURE:
//   1 → Country
//   2 → State / Region
//   3 → City
//   4 → District / LGA
//   5 → Primary Neighborhood
//   6 → Micro Location
//   7 → Landmark (free text — not in this file)
//
// HOW TO EXTEND:
//   Add entries to TAXONOMY. The cascade UI auto-updates.
//   Never hardcode neighborhood names anywhere else — reference this file.
// ─────────────────────────────────────────────────────────────────────────────

export interface MicroLocation {
  id:      string
  label:   string
}

export interface Neighborhood {
  id:          string
  label:       string
  slug:        string         // used for /neighborhood/[slug] routing
  micros:      MicroLocation[]
}

export interface District {
  id:            string
  label:         string
  neighborhoods: Neighborhood[]
}

export interface City {
  id:        string
  label:     string
  districts: District[]
}

export interface StateRegion {
  id:     string
  label:  string
  cities: City[]
}

export interface Country {
  id:     string
  label:  string
  flag:   string
  code:   string   // ISO 3166-1 alpha-2
  states: StateRegion[]
}

// ─────────────────────────────────────────────────────────────────────────────
// THE TAXONOMY
// ─────────────────────────────────────────────────────────────────────────────

export const TAXONOMY: Country[] = [
  {
    id: 'NG', label: 'Nigeria', flag: '🇳🇬', code: 'NG',
    states: [
      {
        id: 'NG-LA', label: 'Lagos',
        cities: [
          {
            id: 'NG-LA-LG', label: 'Lagos',
            districts: [
              {
                id: 'NG-LA-LG-EO', label: 'Eti-Osa / Lekki Axis',
                neighborhoods: [
                  {
                    id: 'lekki-phase-1', label: 'Lekki Phase 1', slug: 'lekki-phase-1',
                    micros: [
                      { id: 'chevron',      label: 'Chevron' },
                      { id: 'admiralty',    label: 'Admiralty Way' },
                      { id: 'oniru',        label: 'Oniru' },
                      { id: 'osapa',        label: 'Osapa London' },
                      { id: 'pinnock',      label: 'Pinnock Beach Estate' },
                      { id: 'lekki-gardens', label: 'Lekki Gardens' },
                    ],
                  },
                  {
                    id: 'ikoyi', label: 'Ikoyi', slug: 'ikoyi',
                    micros: [
                      { id: 'old-ikoyi',     label: 'Old Ikoyi' },
                      { id: 'waterfront',    label: 'Ikoyi Waterfront' },
                      { id: 'bourdillon',    label: 'Bourdillon Road' },
                      { id: 'banana-island', label: 'Banana Island' },
                      { id: 'parkview',      label: 'Parkview Estate' },
                    ],
                  },
                  {
                    id: 'victoria-island', label: 'Victoria Island', slug: 'victoria-island',
                    micros: [
                      { id: 'adeola-odeku',  label: 'Adeola Odeku' },
                      { id: 'adetokunbo',    label: 'Adetokunbo Ademola' },
                      { id: 'ahmadu-bello',  label: 'Ahmadu Bello Way' },
                      { id: 'ozumba',        label: 'Ozumba Mbadiwe' },
                      { id: 'vi-extension',  label: 'VI Extension' },
                    ],
                  },
                  {
                    id: 'ajah', label: 'Ajah', slug: 'ajah',
                    micros: [
                      { id: 'abraham-adesanya', label: 'Abraham Adesanya' },
                      { id: 'awoyaya',           label: 'Awoyaya' },
                      { id: 'ado-road',          label: 'Ado Road' },
                      { id: 'thomas-estate',     label: 'Thomas Estate' },
                      { id: 'atlantic-layout',   label: 'Atlantic Layout' },
                    ],
                  },
                  {
                    id: 'sangotedo', label: 'Sangotedo', slug: 'sangotedo',
                    micros: [
                      { id: 'lakowe',     label: 'Lakowe' },
                      { id: 'peninsula',  label: 'Peninsula' },
                      { id: 'ikota',      label: 'Ikota' },
                    ],
                  },
                  {
                    id: 'ikota', label: 'Ikota', slug: 'ikota',
                    micros: [
                      { id: 'ikota-shopping', label: 'Near Ikota Shopping Complex' },
                      { id: 'vgc',            label: 'VGC' },
                    ],
                  },
                ],
              },
              {
                id: 'NG-LA-LG-LK', label: 'Lekki (Free Trade Zone Corridor)',
                neighborhoods: [
                  {
                    id: 'lekki-scheme-2', label: 'Lekki Scheme 2', slug: 'lekki-scheme-2',
                    micros: [
                      { id: 'alpha-beach', label: 'Alpha Beach Road' },
                      { id: 'richland',    label: 'Richland Estate' },
                    ],
                  },
                  {
                    id: 'epe', label: 'Epe', slug: 'epe',
                    micros: [
                      { id: 'epe-town',    label: 'Epe Town' },
                      { id: 'lakowe-epe',  label: 'Lakowe' },
                    ],
                  },
                ],
              },
              {
                id: 'NG-LA-LG-IK', label: 'Ikeja',
                neighborhoods: [
                  {
                    id: 'ikeja-gra', label: 'Ikeja GRA', slug: 'ikeja-gra',
                    micros: [
                      { id: 'mende',        label: 'Mende' },
                      { id: 'maryland',     label: 'Maryland' },
                      { id: 'allen-avenue', label: 'Allen Avenue' },
                    ],
                  },
                  {
                    id: 'magodo', label: 'Magodo', slug: 'magodo',
                    micros: [
                      { id: 'magodo-ph1', label: 'Magodo Phase 1' },
                      { id: 'magodo-ph2', label: 'Magodo Phase 2' },
                    ],
                  },
                  {
                    id: 'ojodu', label: 'Ojodu / Berger', slug: 'ojodu',
                    micros: [
                      { id: 'berger',   label: 'Berger' },
                      { id: 'omole',    label: 'Omole Estate' },
                    ],
                  },
                ],
              },
              {
                id: 'NG-LA-LG-MS', label: 'Mainland / Surulere / Yaba',
                neighborhoods: [
                  {
                    id: 'surulere', label: 'Surulere', slug: 'surulere',
                    micros: [
                      { id: 'aguda',    label: 'Aguda' },
                      { id: 'ijesha',   label: 'Ijesha' },
                      { id: 'ijeshatedo', label: 'Ijeshatedo' },
                    ],
                  },
                  {
                    id: 'yaba', label: 'Yaba', slug: 'yaba',
                    micros: [
                      { id: 'akoka',    label: 'Akoka' },
                      { id: 'iwaya',    label: 'Iwaya' },
                      { id: 'abule-oja', label: 'Abule Oja' },
                    ],
                  },
                  {
                    id: 'gbagada', label: 'Gbagada', slug: 'gbagada',
                    micros: [
                      { id: 'gbagada-ph1', label: 'Gbagada Phase 1' },
                      { id: 'gbagada-ph2', label: 'Gbagada Phase 2' },
                      { id: 'ifako',       label: 'Ifako' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'NG-AB', label: 'Abuja (FCT)',
        cities: [
          {
            id: 'NG-AB-AB', label: 'Abuja',
            districts: [
              {
                id: 'NG-AB-AB-CD', label: 'Central District',
                neighborhoods: [
                  {
                    id: 'maitama', label: 'Maitama', slug: 'maitama',
                    micros: [
                      { id: 'maitama-north', label: 'Maitama North' },
                      { id: 'maitama-south', label: 'Maitama South' },
                      { id: 'diplomatic',    label: 'Diplomatic Zone' },
                    ],
                  },
                  {
                    id: 'asokoro', label: 'Asokoro', slug: 'asokoro',
                    micros: [
                      { id: 'asokoro-ext', label: 'Asokoro Extension' },
                    ],
                  },
                  {
                    id: 'wuse-2', label: 'Wuse 2', slug: 'wuse-2',
                    micros: [
                      { id: 'aminu-kano',  label: 'Aminu Kano Crescent' },
                      { id: 'usuma',       label: 'Usuma Street' },
                    ],
                  },
                  {
                    id: 'garki', label: 'Garki', slug: 'garki',
                    micros: [
                      { id: 'garki-1', label: 'Garki 1' },
                      { id: 'garki-2', label: 'Garki 2' },
                    ],
                  },
                ],
              },
              {
                id: 'NG-AB-AB-SD', label: 'Satellite Districts',
                neighborhoods: [
                  {
                    id: 'gwarinpa', label: 'Gwarinpa', slug: 'gwarinpa',
                    micros: [
                      { id: 'gwarinpa-estate', label: 'Gwarinpa Estate' },
                      { id: '1st-avenue',       label: '1st Avenue' },
                    ],
                  },
                  {
                    id: 'jabi', label: 'Jabi', slug: 'jabi',
                    micros: [
                      { id: 'jabi-lake', label: 'Jabi Lake Area' },
                    ],
                  },
                  {
                    id: 'lugbe', label: 'Lugbe', slug: 'lugbe',
                    micros: [
                      { id: 'lugbe-ext',    label: 'Lugbe Extension' },
                      { id: 'airport-road', label: 'Airport Road' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'GH', label: 'Ghana', flag: '🇬🇭', code: 'GH',
    states: [
      {
        id: 'GH-GA', label: 'Greater Accra',
        cities: [
          {
            id: 'GH-GA-AC', label: 'Accra',
            districts: [
              {
                id: 'GH-GA-AC-EN', label: 'East / North Accra',
                neighborhoods: [
                  {
                    id: 'east-legon', label: 'East Legon', slug: 'east-legon',
                    micros: [
                      { id: 'el-hills',       label: 'East Legon Hills' },
                      { id: 'el-american',    label: 'American House Area' },
                      { id: 'el-haatso',      label: 'Haatso' },
                    ],
                  },
                  {
                    id: 'airport-residential', label: 'Airport Residential', slug: 'airport-residential',
                    micros: [
                      { id: 'airport-hills', label: 'Airport Hills' },
                      { id: 'volta-street',  label: 'Volta Street Area' },
                    ],
                  },
                  {
                    id: 'adjiringanor', label: 'Adjiringanor', slug: 'adjiringanor',
                    micros: [
                      { id: 'adjiri-main', label: 'Main Adjiringanor' },
                    ],
                  },
                ],
              },
              {
                id: 'GH-GA-AC-CN', label: 'Central / Cantonments Area',
                neighborhoods: [
                  {
                    id: 'cantonments', label: 'Cantonments', slug: 'cantonments',
                    micros: [
                      { id: 'cantonment-crescent', label: 'Cantonments Crescent' },
                    ],
                  },
                  {
                    id: 'labone', label: 'Labone', slug: 'labone',
                    micros: [
                      { id: 'labone-crescent', label: 'Labone Crescent' },
                      { id: 'ringway',         label: 'Ringway Estate' },
                    ],
                  },
                  {
                    id: 'osu', label: 'Osu', slug: 'osu',
                    micros: [
                      { id: 'oxford-street', label: 'Oxford Street' },
                      { id: 'osu-RE',        label: 'Osu RE' },
                    ],
                  },
                ],
              },
              {
                id: 'GH-GA-AC-TM', label: 'Tema / Greater Accra East',
                neighborhoods: [
                  {
                    id: 'tema-community', label: 'Tema Community', slug: 'tema-community',
                    micros: [
                      { id: 'comm-25', label: 'Community 25' },
                      { id: 'comm-18', label: 'Community 18' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'KE', label: 'Kenya', flag: '🇰🇪', code: 'KE',
    states: [
      {
        id: 'KE-NC', label: 'Nairobi County',
        cities: [
          {
            id: 'KE-NC-NB', label: 'Nairobi',
            districts: [
              {
                id: 'KE-NC-NB-WE', label: 'Westlands / Lavington',
                neighborhoods: [
                  {
                    id: 'westlands', label: 'Westlands', slug: 'westlands',
                    micros: [
                      { id: 'westgate',   label: 'Near Westgate' },
                      { id: 'sarit',      label: 'Sarit Centre Area' },
                      { id: 'parklands',  label: 'Parklands' },
                    ],
                  },
                  {
                    id: 'lavington', label: 'Lavington', slug: 'lavington',
                    micros: [
                      { id: 'lavington-green', label: 'Lavington Green' },
                      { id: 'james-gichuru',   label: 'James Gichuru Road' },
                    ],
                  },
                  {
                    id: 'kilimani', label: 'Kilimani', slug: 'kilimani',
                    micros: [
                      { id: 'yaya-centre',  label: 'Yaya Centre Area' },
                      { id: 'wood-avenue',  label: 'Wood Avenue' },
                      { id: 'argwings',     label: 'Argwings Kodhek Road' },
                    ],
                  },
                ],
              },
              {
                id: 'KE-NC-NB-KR', label: 'Karen / Langata / Runda',
                neighborhoods: [
                  {
                    id: 'karen', label: 'Karen', slug: 'karen',
                    micros: [
                      { id: 'karen-hardy', label: 'Karen Hardy' },
                      { id: 'langata',     label: 'Langata Road' },
                    ],
                  },
                  {
                    id: 'runda', label: 'Runda', slug: 'runda',
                    micros: [
                      { id: 'runda-estate', label: 'Runda Estate' },
                      { id: 'runda-grove',  label: 'Runda Grove' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function getCountries(): Country[] {
  return TAXONOMY
}

export function getStates(countryId: string): StateRegion[] {
  return TAXONOMY.find(c => c.id === countryId)?.states || []
}

export function getCities(countryId: string, stateId: string): City[] {
  return getStates(countryId).find(s => s.id === stateId)?.cities || []
}

export function getDistricts(countryId: string, stateId: string, cityId: string): District[] {
  return getCities(countryId, stateId).find(c => c.id === cityId)?.districts || []
}

export function getNeighborhoods(
  countryId: string, stateId: string, cityId: string, districtId: string
): Neighborhood[] {
  return getDistricts(countryId, stateId, cityId)
    .find(d => d.id === districtId)?.neighborhoods || []
}

export function getMicros(
  countryId: string, stateId: string, cityId: string, districtId: string, neighborhoodId: string
): MicroLocation[] {
  return getNeighborhoods(countryId, stateId, cityId, districtId)
    .find(n => n.id === neighborhoodId)?.micros || []
}

/** Flatten all neighborhoods across the taxonomy for search/autocomplete */
export function getAllNeighborhoods(): Array<{
  id:           string
  label:        string
  slug:         string
  districtLabel: string
  cityLabel:    string
  stateLabel:   string
  countryCode:  string
  countryLabel: string
}> {
  const results = []
  for (const country of TAXONOMY) {
    for (const state of country.states) {
      for (const city of state.cities) {
        for (const district of city.districts) {
          for (const n of district.neighborhoods) {
            results.push({
              id:            n.id,
              label:         n.label,
              slug:          n.slug,
              districtLabel: district.label,
              cityLabel:     city.label,
              stateLabel:    state.label,
              countryCode:   country.code,
              countryLabel:  country.label,
            })
          }
        }
      }
    }
  }
  return results
}

/** Resolve a neighborhood slug → full location path string */
export function resolveSlug(slug: string): string {
  for (const country of TAXONOMY) {
    for (const state of country.states) {
      for (const city of state.cities) {
        for (const district of city.districts) {
          const n = district.neighborhoods.find(n => n.slug === slug)
          if (n) {
            return `${n.label}, ${city.label}, ${state.label}, ${country.label}`
          }
        }
      }
    }
  }
  return slug
}

// ─────────────────────────────────────────────────────────────────────────────
// CURRENCY MAP — country → default currency
// ─────────────────────────────────────────────────────────────────────────────

export const COUNTRY_CURRENCY: Record<string, { code: string; symbol: string; label: string }> = {
  NG: { code: 'NGN', symbol: '₦', label: 'Naira (NGN)' },
  GH: { code: 'GHS', symbol: 'GH₵', label: 'Cedi (GHS)' },
  KE: { code: 'KES', symbol: 'KSh', label: 'Shilling (KES)' },
}