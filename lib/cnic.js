// CNIC district prefixes — the FIRST 3 digits of a Pakistani CNIC encode
// the district (digit 1 = province, digit 2 = division, digit 3 = district).
// The full 5-digit prefix also encodes tehsil + registration office, so
// every district has MANY valid 5-digit prefixes sharing the same first 3
// digits (e.g. Peshawar 17301, 17302…; Lahore 35200, 35201, 35202…). A
// strict first-5 check would lock out most legitimate users — the check
// MUST match on the first 3 digits only. Source of this rule: NADRA's
// numbering structure (via Express Tribune, 7 May 2017) + the verified
// research table in ~/workspace/new-projects/cnic-district-codes.md.
//
// COVERAGE: 76 of 168 districts have a VERIFIED 3-digit prefix below.
// A district NOT in this table is FAIL-CLOSED: nobody can sign up for it
// by CNIC check until its prefix is verified — never guess a code.
// (Verified counts: KPK 22, Punjab 23, Sindh 18, Balochistan 12 — Gwadar
// 521 and Kalat 512 are conflict-resolved toward the BPSC/GIEDA domicile
// lists — ICT 1. Gilgit-Baltistan and AJK: 0 verified.)
//
// HONEST LIMIT: this is a FORMAT/PREFIX check only. It does NOT verify
// with NADRA and cannot prove the CNIC belongs to the person holding it.
// A CNIC also records place of REGISTRATION, not current residence — a
// real resident of a district can legitimately hold another district's
// prefix (registered elsewhere). So a mismatch is a hard block here only
// because the user ordered it that way; the recommended future fallback is
// manual review / domicile-document upload (see README).
'use strict';

// district name (as in lib/districts.js) -> verified 3-digit CNIC prefix.
const CNIC_PREFIXES = {
  // Khyber Pakhtunkhwa (22)
  'Abbottabad': '131',
  'Bannu': '111',
  'Batagram': '132',
  'Buner': '151',
  'Charsadda': '171',
  'Lower Chitral': '152',
  'Upper Chitral': '152',
  'Dera Ismail Khan': '121',
  'Lower Dir': '153',
  'Hangu': '141',
  'Haripur': '133',
  'Kohat': '143',
  'Lower Kohistan': '134',
  'Lakki Marwat': '112',
  'Malakand': '154',
  'Mansehra': '135',
  'Mardan': '161',
  'Nowshera': '172',
  'Peshawar': '173',
  'Shangla': '155',
  'Swabi': '162',
  'Swat': '156',
  // Punjab (23)
  'Attock': '371',
  'Bahawalnagar': '311',
  'Bahawalpur': '312',
  'Bhakkar': '381',
  'Chakwal': '372',
  'Dera Ghazi Khan': '321',
  'Faisalabad': '331',
  'Gujranwala': '341',
  'Gujrat': '342',
  'Hafizabad': '343',
  'Jhang': '332',
  'Kasur': '351',
  'Khanewal': '361',
  'Lahore': '352',
  'Layyah': '322',
  'Multan': '363',
  'Muzaffargarh': '323',
  'Okara': '353',
  'Rajanpur': '324',
  'Rawalpindi': '374',
  'Sargodha': '384',
  'Sheikhupura': '354',
  'Sialkot': '346',
  // Sindh (18)
  'Badin': '411',
  'Dadu': '412',
  'Ghotki': '451',
  'Hyderabad': '413',
  'Karachi Central': '421',
  'Karachi East': '422',
  'Karachi South': '423',
  'Karachi West': '424',
  'Khairpur': '452',
  'Korangi': '422',
  'Larkana': '432',
  'Malir': '425',
  'Matiari': '415',
  'Naushahro Feroze': '453',
  'Qambar Shahdadkot': '432',
  'Sanghar': '442',
  'Sukkur': '455',
  'Tando Allahyar': '413',
  // Balochistan (12)
  'Chaman': '542',
  'Gwadar': '521',
  'Kalat': '512',
  'Kech': '522',
  'Kharan': '513',
  'Khuzdar': '514',
  'Loralai': '563',
  'Mastung': '516',
  'Panjgur': '523',
  'Quetta': '544',
  'Surab': '512',
  'Zhob': '565',
  // Islamabad Capital Territory (1)
  'Islamabad': '611',
};

// district name -> verified 3-digit prefix, or null when unverified
// (fail closed — signup for that district is unavailable).
function cnicPrefixForDistrict(name) {
  if (!name) return null;
  if (CNIC_PREFIXES[name]) return CNIC_PREFIXES[name];
  const key = Object.keys(CNIC_PREFIXES).find((k) => k.toLowerCase() === String(name).toLowerCase());
  return key ? CNIC_PREFIXES[key] : null;
}

// 3-digit prefix -> district name, or null when unknown or ambiguous
// (several split districts share a prefix, e.g. 152, 422, 432, 413, 512).
function districtForCnicPrefix(prefix) {
  const matches = Object.keys(CNIC_PREFIXES).filter((d) => CNIC_PREFIXES[d] === String(prefix));
  return matches.length === 1 ? matches[0] : null;
}

module.exports = { CNIC_PREFIXES, cnicPrefixForDistrict, districtForCnicPrefix };
