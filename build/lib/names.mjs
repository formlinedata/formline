// Turning API-Football's names into the archive's. Teams are matched against the archive's own team list, so a
// name only has to be listed here when simple normalisation cannot match it. Anything unmatched is reported in
// data/status.json rather than guessed.

// API-Football spelling -> archive spelling.
export const TEAM_ALIASES = {
  'USA': 'United States', 'United States of America': 'United States',
  'Korea Republic': 'South Korea', 'Republic of Korea': 'South Korea', 'Korea DPR': 'North Korea', "Korea, DPR": 'North Korea',
  'Congo DR': 'DR Congo', 'Congo-DR': 'DR Congo', 'DR Congo': 'DR Congo', 'Congo Republic': 'Congo',
  'Cape Verde Islands': 'Cape Verde', 'Cabo Verde': 'Cape Verde',
  'Chinese Taipei': 'Taiwan', 'China PR': 'China',
  'Czechia': 'Czech Republic', 'Türkiye': 'Turkey', 'Turkiye': 'Turkey',
  'Bosnia': 'Bosnia and Herzegovina', 'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina', 'Central Africa': 'Central African Republic', 'French Guyana': 'French Guiana',
  'FYR Macedonia': 'North Macedonia', 'Macedonia': 'North Macedonia',
  'Ireland': 'Republic of Ireland', 'Rep. of Ireland': 'Republic of Ireland',
  'Swaziland': 'Eswatini', 'East Timor': 'Timor-Leste', 'Brunei Darussalam': 'Brunei',
  'Kyrgyz Republic': 'Kyrgyzstan', 'Macao': 'Macau', 'Curacao': 'Curaçao',
  'Sao Tome and Principe': 'São Tomé and Príncipe', 'Sao Tome & Principe': 'São Tomé and Príncipe',
  'St. Kitts and Nevis': 'Saint Kitts and Nevis', 'St Kitts and Nevis': 'Saint Kitts and Nevis',
  'St. Lucia': 'Saint Lucia', 'St Lucia': 'Saint Lucia',
  'St. Vincent / Grenadines': 'Saint Vincent and the Grenadines', 'St Vincent and Grenadines': 'Saint Vincent and the Grenadines',
  'St. Vincent and the Grenadines': 'Saint Vincent and the Grenadines',
  'US Virgin Islands': 'United States Virgin Islands', 'U.S. Virgin Islands': 'United States Virgin Islands',
  'Guinea Bissau': 'Guinea-Bissau', 'UAE': 'United Arab Emirates',
  "Côte d'Ivoire": 'Ivory Coast', "Cote D'Ivoire": 'Ivory Coast', 'Cote d Ivoire': 'Ivory Coast',
  'Turks and Caicos': 'Turks and Caicos Islands', 'Gambia The': 'Gambia', 'The Gambia': 'Gambia',
  'Hong Kong, China': 'Hong Kong', 'Iran IR': 'Iran', 'IR Iran': 'Iran', 'Syrian Arab Republic': 'Syria',
  'Viet Nam': 'Vietnam', 'Lao PDR': 'Laos', 'Palestinian Territory': 'Palestine'
};

export const normKey = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/\bst\.?\s/g, 'saint ').replace(/-/g, ' ').replace(/\bthe\b/g, '').replace(/[^a-z]/g, '');

const YOUTH = /\bU-?\s?(1[5-9]|2[0-3])\b|\bunder[- ]?(1[5-9]|2[0-3])\b|\byouth\b|\bolympic team\b/i;

/* Decide gender and archive name for an API team name. Returns {gender, name} or {skip:reason}. */
export function makeTeamMatcher(archiveTeams){
  // archiveTeams: {men:Set, women:Set}
  const index = {}, alias = new Map(Object.entries(TEAM_ALIASES).map(([k, v]) => [normKey(k), v]));
  for (const g of ['men', 'women']){
    index[g] = new Map();
    for (const t of archiveTeams[g]) index[g].set(normKey(t), t);
  }
  return function match(apiName, leagueName){
    let n = String(apiName || '').trim();
    if (YOUTH.test(n) || YOUTH.test(leagueName || '')) return {skip:'youth'};
    let g = 'men';
    if (/\sW$/.test(n) || /\bwomen\b/i.test(n)){ g = 'women'; n = n.replace(/\sW$/, '').replace(/\s*women('s)?\s*/i, ' ').trim(); }
    if (/\bwomen|female|féminin/i.test(leagueName || '')) g = 'women';
    const aliased = TEAM_ALIASES[n] || alias.get(normKey(n)) || n;
    /* A national team the other archive knows (San Marino's women, say, before their first archived match) is the same
       team: take its name from there rather than dropping the match. */
    const hit = index[g].get(normKey(aliased)) || index[g === 'men' ? 'women' : 'men'].get(normKey(aliased));
    return hit ? {gender:g, name:hit} : {gender:g, unmatched:n};
  };
}

/* API league name -> archive tournament name. Each rule lists candidates; the first that already exists in that
   gender's archive is used, so the gap-filler files matches under the names the archive itself uses. null means
   the competition is not counted by the archive (youth, men's Olympics, CHAN) and its matches are skipped. */
const RULES = [
  [/^friendlies( women)?$|^international friendlies|^friendly international/i, ['Friendly']],
  [/world cup.*qualif|qualif.*world cup/i, ['FIFA World Cup qualification']],
  [/^(fifa )?world cup( - women| women)?$/i, ['FIFA World Cup']],
  [/(euro championship|uefa championship|women'?s euro|uefa euro).*qualif/i, ['UEFA Euro qualification']],
  [/^(euro championship|uefa championship|uefa euro)( - women| women)?$/i, ['UEFA Euro']],
  [/uefa nations league|^nations league$/i, ['UEFA Nations League']],
  [/concacaf nations league/i, ['CONCACAF Nations League']],
  [/conmebol nations league/i, ['CONMEBOL Nations League']],
  [/^africa(n)? cup of nations.*qualif/i, ['African Cup of Nations qualification']],
  [/^africa(n)? cup of nations( - women| women)?$/i, ['African Cup of Nations']],
  [/african nations championship|\bchan\b/i, null],
  [/^(afc )?asian cup.*qualif/i, ['AFC Asian Cup qualification']],
  [/^(afc )?asian cup( - women| women)?$/i, ['AFC Asian Cup']],
  [/gold cup.*qualif/i, ['Gold Cup qualification', 'CONCACAF Gold Cup qualification']],
  [/gold cup/i, ['Gold Cup', 'CONCACAF Gold Cup']],
  [/concacaf w championship.*qualif|concacaf championship.*qualif/i, ['CONCACAF Championship qualification']],
  [/concacaf w championship|concacaf championship/i, ['CONCACAF Championship']],
  [/concacaf series/i, ['CONCACAF Series']],
  [/copa am[eé]rica/i, ['Copa América']],
  [/arab cup.*qualif/i, ['Arab Cup qualification']],
  [/arab cup/i, ['Arab Cup']],
  [/gulf cup/i, ['Gulf Cup']],
  [/\bsaff\b/i, ['SAFF Cup', 'SAFF Championship']],
  [/(\baff\b|asean|mitsubishi electric).*(championship|cup).*qualif/i, ['ASEAN Championship qualification', 'AFF Championship qualification']],
  [/(\baff\b|asean|mitsubishi electric).*(championship|cup)/i, ['ASEAN Championship', 'AFF Championship']],
  [/cecafa/i, ['CECAFA Cup', 'CECAFA Championship']],
  [/cosafa/i, ['COSAFA Cup', 'COSAFA Championship']],
  [/\bwaff\b/i, ['WAFF Championship']],
  [/(eaff|e-1).*qualif/i, ['EAFF Championship qualification', 'EAFF E-1 Championship qualification']],
  [/eaff|e-1 football/i, ['EAFF Championship', 'EAFF E-1 Championship']],
  [/\bcafa\b/i, ['CAFA Nations Cup', 'CAFA Championship']],
  [/(ofc|oceania) nations cup.*qualif/i, ['Oceania Nations Cup qualification']],
  [/(ofc|oceania) nations cup/i, ['Oceania Nations Cup', 'OFC Nations Cup']],
  [/fifa series/i, ['FIFA Series']],
  [/king'?s cup/i, ["King's Cup"]],
  [/kirin/i, ['Kirin Cup', 'Kirin Challenge Cup']],
  [/baltic cup/i, ['Baltic Cup']],
  [/pacific games/i, ['Pacific Games']],
  [/island games/i, ['Island Games']],
  [/shebelieves/i, ['SheBelieves Cup']],
  [/pinatar/i, ['Pinatar Cup']],
  [/arnold clark/i, ['Arnold Clark Cup']],
  [/algarve/i, ['Algarve Cup']],
  [/cyprus (women'?s )?cup/i, ['Cyprus Cup']],
  [/turkish women'?s cup/i, ["Turkish Women's Cup"]],
  [/tournoi de france/i, ['Tournoi de France']],
  [/finalissima/i, ['Finalissima', 'CONMEBOL–UEFA Cup of Champions']],
  [/olympic.*qualif|qualif.*olympic/i, {men:null, women:'RAW'}],
  [/olympic/i, {men:null, women:['Olympic Games']}],
  [/club friendlies|super cup|champions league|libertadores|sudamericana|concacaf champions/i, null]
];
export function makeTournamentMapper(archiveTournaments){
  return function mapTournament(leagueName, gender){
    for (const [re, cand] of RULES){
      if (!re.test(leagueName)) continue;
      const list = cand && !Array.isArray(cand) ? cand[gender] : cand;
      if (list === null) return {skip:'not counted'};
      if (list === 'RAW') return {name: leagueName};
      const have = archiveTournaments[gender];
      return {name: list.find(c => have.has(c)) || list[0]};
    }
    return {name: leagueName, unmapped: true};
  };
}

/* Venue country (API spelling) -> archive country spelling. */
export function archiveCountry(c){
  if (!c) return '';
  const s = String(c).replace(/-/g, ' ').trim();
  return TEAM_ALIASES[s] || ({'Korea Republic':'South Korea', 'South Korea':'South Korea', 'Czech Republic':'Czech Republic'}[s]) || s;
}
