// All 168 districts of Pakistan, grouped by province.
// COPIED VERBATIM from Mandi Price Intelligence (~/workspace/mandi-price-intelligence/seed-data.json,
// 'provinces' key) — the single source of truth for the district list —
// EXCEPT the two entries the QA pass (2026-11-05) proved are NOT districts
// ("Bari Swat" is part of Swat; "Paharpur" is a tehsil of Dera Ismail Khan),
// removed here so the site never lists a fake district. Mandi's list still
// carries them and needs the same cleanup. AND (review 2026-11-07): "Lehri"
// was removed — it was abolished as a district in 2018 (merged back into
// Sibi) — and "Zhob" added in its place: Zhob is a real, current district
// (Zhob Division; 2023 census population 355,692) whose CNIC prefix 565 is
// VERIFIED in lib/cnic.js and the research table, but which the copied list
// had dropped entirely, so Zhob residents got "district not found" and the
// site's "76 verified" claim was only 75 in practice. Counts unchanged:
// Punjab 41, Khyber Pakhtunkhwa 36, Sindh 30, Balochistan 36, Islamabad
// Capital Territory 1, Gilgit-Baltistan 14, Azad Jammu and Kashmir 10 = 168.
'use strict';

const PROVINCE_ORDER = ["Punjab", "Khyber Pakhtunkhwa", "Sindh", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Jammu and Kashmir"];

const DISTRICTS = [
  { name: "Attock", province: "Punjab" },
  { name: "Bahawalnagar", province: "Punjab" },
  { name: "Bahawalpur", province: "Punjab" },
  { name: "Bhakkar", province: "Punjab" },
  { name: "Chakwal", province: "Punjab" },
  { name: "Chiniot", province: "Punjab" },
  { name: "Dera Ghazi Khan", province: "Punjab" },
  { name: "Faisalabad", province: "Punjab" },
  { name: "Gujranwala", province: "Punjab" },
  { name: "Gujrat", province: "Punjab" },
  { name: "Hafizabad", province: "Punjab" },
  { name: "Jhang", province: "Punjab" },
  { name: "Jhelum", province: "Punjab" },
  { name: "Kasur", province: "Punjab" },
  { name: "Khanewal", province: "Punjab" },
  { name: "Khushab", province: "Punjab" },
  { name: "Lahore", province: "Punjab" },
  { name: "Layyah", province: "Punjab" },
  { name: "Lodhran", province: "Punjab" },
  { name: "Mandi Bahauddin", province: "Punjab" },
  { name: "Mianwali", province: "Punjab" },
  { name: "Multan", province: "Punjab" },
  { name: "Muzaffargarh", province: "Punjab" },
  { name: "Narowal", province: "Punjab" },
  { name: "Nankana Sahib", province: "Punjab" },
  { name: "Okara", province: "Punjab" },
  { name: "Pakpattan", province: "Punjab" },
  { name: "Rahim Yar Khan", province: "Punjab" },
  { name: "Rajanpur", province: "Punjab" },
  { name: "Rawalpindi", province: "Punjab" },
  { name: "Sahiwal", province: "Punjab" },
  { name: "Sargodha", province: "Punjab" },
  { name: "Sheikhupura", province: "Punjab" },
  { name: "Sialkot", province: "Punjab" },
  { name: "Toba Tek Singh", province: "Punjab" },
  { name: "Kot Adu", province: "Punjab" },
  { name: "Murree", province: "Punjab" },
  { name: "Talagang", province: "Punjab" },
  { name: "Taunsa", province: "Punjab" },
  { name: "Vehari", province: "Punjab" },
  { name: "Wazirabad", province: "Punjab" },
  { name: "Abbottabad", province: "Khyber Pakhtunkhwa" },
  { name: "Bajaur", province: "Khyber Pakhtunkhwa" },
  { name: "Bannu", province: "Khyber Pakhtunkhwa" },
  { name: "Batagram", province: "Khyber Pakhtunkhwa" },
  { name: "Buner", province: "Khyber Pakhtunkhwa" },
  { name: "Charsadda", province: "Khyber Pakhtunkhwa" },
  { name: "Dera Ismail Khan", province: "Khyber Pakhtunkhwa" },
  { name: "Hangu", province: "Khyber Pakhtunkhwa" },
  { name: "Haripur", province: "Khyber Pakhtunkhwa" },
  { name: "Karak", province: "Khyber Pakhtunkhwa" },
  { name: "Khyber", province: "Khyber Pakhtunkhwa" },
  { name: "Kohat", province: "Khyber Pakhtunkhwa" },
  { name: "Kolai Palas", province: "Khyber Pakhtunkhwa" },
  { name: "Kurram", province: "Khyber Pakhtunkhwa" },
  { name: "Lakki Marwat", province: "Khyber Pakhtunkhwa" },
  { name: "Lower Chitral", province: "Khyber Pakhtunkhwa" },
  { name: "Lower Dir", province: "Khyber Pakhtunkhwa" },
  { name: "Lower Kohistan", province: "Khyber Pakhtunkhwa" },
  { name: "Malakand", province: "Khyber Pakhtunkhwa" },
  { name: "Mansehra", province: "Khyber Pakhtunkhwa" },
  { name: "Mardan", province: "Khyber Pakhtunkhwa" },
  { name: "Mohmand", province: "Khyber Pakhtunkhwa" },
  { name: "North Waziristan", province: "Khyber Pakhtunkhwa" },
  { name: "Nowshera", province: "Khyber Pakhtunkhwa" },
  { name: "Orakzai", province: "Khyber Pakhtunkhwa" },
  { name: "Peshawar", province: "Khyber Pakhtunkhwa" },
  { name: "Shangla", province: "Khyber Pakhtunkhwa" },
  { name: "South Waziristan Lower", province: "Khyber Pakhtunkhwa" },
  { name: "South Waziristan Upper", province: "Khyber Pakhtunkhwa" },
  { name: "Swabi", province: "Khyber Pakhtunkhwa" },
  { name: "Swat", province: "Khyber Pakhtunkhwa" },
  { name: "Tank", province: "Khyber Pakhtunkhwa" },
  { name: "Torghar", province: "Khyber Pakhtunkhwa" },
  { name: "Upper Chitral", province: "Khyber Pakhtunkhwa" },
  { name: "Upper Dir", province: "Khyber Pakhtunkhwa" },
  { name: "Upper Kohistan", province: "Khyber Pakhtunkhwa" },
  { name: "Badin", province: "Sindh" },
  { name: "Dadu", province: "Sindh" },
  { name: "Ghotki", province: "Sindh" },
  { name: "Hyderabad", province: "Sindh" },
  { name: "Jacobabad", province: "Sindh" },
  { name: "Jamshoro", province: "Sindh" },
  { name: "Karachi Central", province: "Sindh" },
  { name: "Karachi East", province: "Sindh" },
  { name: "Karachi South", province: "Sindh" },
  { name: "Karachi West", province: "Sindh" },
  { name: "Kashmore", province: "Sindh" },
  { name: "Keamari", province: "Sindh" },
  { name: "Khairpur", province: "Sindh" },
  { name: "Korangi", province: "Sindh" },
  { name: "Larkana", province: "Sindh" },
  { name: "Malir", province: "Sindh" },
  { name: "Matiari", province: "Sindh" },
  { name: "Mirpur Khas", province: "Sindh" },
  { name: "Naushahro Feroze", province: "Sindh" },
  { name: "Qambar Shahdadkot", province: "Sindh" },
  { name: "Sanghar", province: "Sindh" },
  { name: "Shaheed Benazirabad", province: "Sindh" },
  { name: "Shikarpur", province: "Sindh" },
  { name: "Sukkur", province: "Sindh" },
  { name: "Sujawal", province: "Sindh" },
  { name: "Tando Allahyar", province: "Sindh" },
  { name: "Tando Muhammad Khan", province: "Sindh" },
  { name: "Tharparkar", province: "Sindh" },
  { name: "Thatta", province: "Sindh" },
  { name: "Umerkot", province: "Sindh" },
  { name: "Awaran", province: "Balochistan" },
  { name: "Barkhan", province: "Balochistan" },
  { name: "Chagai", province: "Balochistan" },
  { name: "Chaman", province: "Balochistan" },
  { name: "Dera Bugti", province: "Balochistan" },
  { name: "Duki", province: "Balochistan" },
  { name: "Gwadar", province: "Balochistan" },
  { name: "Harnai", province: "Balochistan" },
  { name: "Hub", province: "Balochistan" },
  { name: "Jafarabad", province: "Balochistan" },
  { name: "Jhal Magsi", province: "Balochistan" },
  { name: "Kachhi", province: "Balochistan" },
  { name: "Kalat", province: "Balochistan" },
  { name: "Kech", province: "Balochistan" },
  { name: "Kharan", province: "Balochistan" },
  { name: "Khuzdar", province: "Balochistan" },
  { name: "Killa Abdullah", province: "Balochistan" },
  { name: "Killa Saifullah", province: "Balochistan" },
  { name: "Kohlu", province: "Balochistan" },
  { name: "Lasbela", province: "Balochistan" },
  { name: "Zhob", province: "Balochistan" },
  { name: "Loralai", province: "Balochistan" },
  { name: "Mastung", province: "Balochistan" },
  { name: "Musakhel", province: "Balochistan" },
  { name: "Nasirabad", province: "Balochistan" },
  { name: "Nushki", province: "Balochistan" },
  { name: "Panjgur", province: "Balochistan" },
  { name: "Pishin", province: "Balochistan" },
  { name: "Quetta", province: "Balochistan" },
  { name: "Sherani", province: "Balochistan" },
  { name: "Sibi", province: "Balochistan" },
  { name: "Sohbatpur", province: "Balochistan" },
  { name: "Surab", province: "Balochistan" },
  { name: "Usta Muhammad", province: "Balochistan" },
  { name: "Washuk", province: "Balochistan" },
  { name: "Ziarat", province: "Balochistan" },
  { name: "Islamabad", province: "Islamabad Capital Territory" },
  { name: "Gilgit", province: "Gilgit-Baltistan" },
  { name: "Hunza", province: "Gilgit-Baltistan" },
  { name: "Nagar", province: "Gilgit-Baltistan" },
  { name: "Ghizer", province: "Gilgit-Baltistan" },
  { name: "Gupis-Yasin", province: "Gilgit-Baltistan" },
  { name: "Astore", province: "Gilgit-Baltistan" },
  { name: "Diamer", province: "Gilgit-Baltistan" },
  { name: "Darel", province: "Gilgit-Baltistan" },
  { name: "Tangir", province: "Gilgit-Baltistan" },
  { name: "Skardu", province: "Gilgit-Baltistan" },
  { name: "Shigar", province: "Gilgit-Baltistan" },
  { name: "Kharmang", province: "Gilgit-Baltistan" },
  { name: "Ghanche", province: "Gilgit-Baltistan" },
  { name: "Rondu", province: "Gilgit-Baltistan" },
  { name: "Muzaffarabad", province: "Azad Jammu and Kashmir" },
  { name: "Neelum", province: "Azad Jammu and Kashmir" },
  { name: "Hattian", province: "Azad Jammu and Kashmir" },
  { name: "Bagh", province: "Azad Jammu and Kashmir" },
  { name: "Haveli", province: "Azad Jammu and Kashmir" },
  { name: "Poonch", province: "Azad Jammu and Kashmir" },
  { name: "Sudhanoti", province: "Azad Jammu and Kashmir" },
  { name: "Kotli", province: "Azad Jammu and Kashmir" },
  { name: "Mirpur", province: "Azad Jammu and Kashmir" },
  { name: "Bhimber", province: "Azad Jammu and Kashmir" },
];

// DISCO for a district, ONLY where it is unambiguous from the existing DISCO
// directory (server.js seed): LESCO lists Lahore/Kasur/Okara/Sheikhupura,
// IESCO lists Islamabad/Rawalpindi/Attock/Jhelum/Chakwal, PESCO covers Khyber
// Pakhtunkhwa, TESCO covers the tribal (ex-FATA) districts, QESCO covers
// Quetta and Balochistan, K-Electric covers Karachi, HESCO covers Hyderabad
// and southern Sindh, SEPCO covers Sukkur and northern Sindh. Everywhere
// else this returns null — the page then shows only helpline 118 and makes
// NO DISCO guess. Gilgit-Baltistan and AJK have no DISCO in the directory.
const EX_FATA = new Set(['Bajaur', 'Khyber', 'Kurram', 'Mohmand', 'North Waziristan', 'Orakzai', 'South Waziristan Lower', 'South Waziristan Upper']);
const LESCO_DISTRICTS = new Set(['Lahore', 'Kasur', 'Okara', 'Sheikhupura']);
const IESCO_PUNJAB = new Set(['Rawalpindi', 'Attock', 'Jhelum', 'Chakwal']);
const KE_KARACHI = new Set(['Karachi Central', 'Karachi East', 'Karachi South', 'Karachi West', 'Keamari', 'Korangi', 'Malir']);
function discoForDistrict(name, province) {
  if (province === 'Balochistan') return 'QESCO';
  if (province === 'Khyber Pakhtunkhwa') return EX_FATA.has(name) ? 'TESCO' : 'PESCO';
  if (province === 'Islamabad Capital Territory') return 'IESCO';
  if (province === 'Punjab') {
    if (LESCO_DISTRICTS.has(name)) return 'LESCO';
    if (IESCO_PUNJAB.has(name)) return 'IESCO';
    return null;
  }
  if (province === 'Sindh') {
    if (KE_KARACHI.has(name)) return 'K-Electric';
    if (name === 'Hyderabad') return 'HESCO';
    if (name === 'Sukkur') return 'SEPCO';
    return null;
  }
  return null; // Gilgit-Baltistan and AJK: no DISCO in the directory.
}

module.exports = { PROVINCE_ORDER, DISTRICTS, discoForDistrict };

