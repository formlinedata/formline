# Possible errors in the martj42 archives

Found by the Formline data check against the archives as of 6 Oct 2026 (men) and 13 Oct 2026 (women). Each section is written so it can be pasted into a GitHub issue on the relevant repository. Formline corrects these on its own side in the meantime (`CORRECTIONS` and `venueSide` in `index.html`).

## Men's archive (martj42/international_results)

### Home side flagged neutral when the venue is in its own country under a former name (46 rows)

The `country` column uses the period name (Soviet Union, United Arab Republic, Malaya, Irish Free State, Dahomey, Upper Volta) while `home_team` uses the current name, so the neutral flag seems to have been set by comparing the two. These were home matches.

| Date | Home | Score | Away | Tournament | Venue | neutral |
|---|---|---|---|---|---|---|
| 1934-02-25 | Republic of Ireland | 4–4 | Belgium | FIFA World Cup qualification | Dublin, Irish Free State | TRUE |
| 1937-11-07 | Republic of Ireland | 3–3 | Norway | FIFA World Cup qualification | Dublin, Irish Free State | TRUE |
| 1956-03-17 | Malaysia | 9–2 | Cambodia | AFC Asian Cup qualification | Kuala Lumpur, Malaya | TRUE |
| 1956-05-24 | Malaysia | 3–3 | Vietnam Republic | AFC Asian Cup qualification | Kuala Lumpur, Malaya | TRUE |
| 1957-06-23 | Russia | 3–0 | Poland | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1957-07-27 | Russia | 2–1 | Finland | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1958-09-02 | Malaysia | 0–0 | Singapore | Merdeka Tournament | Kuala Lumpur, Malaya | TRUE |
| 1958-12-28 | Egypt | 2–1 | Germany | Friendly | Cairo, United Arab Republic | TRUE |
| 1959-01-04 | Malaysia | 1–3 | Japan | Friendly | George Town, Malaya | TRUE |
| 1959-05-22 | Egypt | 4–0 | Ethiopia | African Cup of Nations | Cairo, United Arab Republic | TRUE |
| 1959-05-29 | Egypt | 2–1 | Sudan | African Cup of Nations | Cairo, United Arab Republic | TRUE |
| 1960-01-08 | Egypt | 0–1 | Yugoslavia | Friendly | Cairo, United Arab Republic | TRUE |
| 1960-04-29 | Egypt | 0–5 | Brazil | Friendly | Cairo, United Arab Republic | TRUE |
| 1960-05-01 | Egypt | 1–3 | Brazil | Friendly | Alexandria, United Arab Republic | TRUE |
| 1960-05-06 | Egypt | 0–3 | Brazil | Friendly | Cairo, United Arab Republic | TRUE |
| 1961-06-18 | Russia | 1–0 | Turkey | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1961-07-01 | Russia | 5–2 | Norway | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1965-05-23 | Russia | 3–1 | Greece | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1965-05-30 | Russia | 2–1 | Wales | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1965-06-27 | Russia | 6–0 | Denmark | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1967-01-17 | Egypt | 1–2 | German DR | Friendly | Cairo, United Arab Republic | TRUE |
| 1967-01-20 | Egypt | 0–3 | German DR | Friendly | Cairo, United Arab Republic | TRUE |
| 1967-01-24 | Egypt | 2–2 | German DR | Friendly | Alexandria, United Arab Republic | TRUE |
| 1969-10-15 | Russia | 3–0 | Turkey | FIFA World Cup qualification | Kyiv, Soviet Union | TRUE |
| 1969-10-22 | Russia | 2–0 | Northern Ireland | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1972-06-18 | Benin | 0–5 | Ghana | FIFA World Cup qualification | Cotonou, Dahomey | TRUE |
| 1973-05-13 | Russia | 1–0 | Republic of Ireland | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1973-05-26 | Russia | 2–0 | France | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1973-09-26 | Russia | 0–0 | Chile | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1976-03-13 | Burkina Faso | 1–1 | Mauritania | FIFA World Cup qualification | Ouagadougou, Upper Volta | TRUE |
| 1976-09-04 | Burkina Faso | 1–1 | Ivory Coast | FIFA World Cup qualification | Ouagadougou, Upper Volta | TRUE |
| 1977-04-24 | Russia | 2–0 | Greece | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1977-05-18 | Russia | 2–0 | Hungary | FIFA World Cup qualification | Tbilisi, Soviet Union | TRUE |
| 1980-10-15 | Russia | 5–0 | Iceland | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1981-09-23 | Russia | 4–0 | Turkey | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1981-10-28 | Russia | 2–0 | Czechoslovakia | FIFA World Cup qualification | Tbilisi, Soviet Union | TRUE |
| 1981-11-18 | Russia | 3–0 | Wales | FIFA World Cup qualification | Tbilisi, Soviet Union | TRUE |
| 1983-08-24 | Samoa | 1–2 | Wallis Islands and Futuna | South Pacific Games | Apia, Western Samoa | TRUE |
| 1985-05-02 | Russia | 4–0 | Switzerland | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1985-09-25 | Russia | 1–0 | Denmark | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1985-10-16 | Russia | 2–0 | Republic of Ireland | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1985-10-30 | Russia | 1–0 | Norway | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1988-10-19 | Russia | 2–0 | Austria | FIFA World Cup qualification | Kyiv, Soviet Union | TRUE |
| 1989-04-26 | Russia | 3–0 | German DR | FIFA World Cup qualification | Kyiv, Soviet Union | TRUE |
| 1989-05-31 | Russia | 1–1 | Iceland | FIFA World Cup qualification | Moscow, Soviet Union | TRUE |
| 1989-11-15 | Russia | 2–0 | Turkey | FIFA World Cup qualification | Simferopol, Soviet Union | TRUE |

### Wrong scores (found 13 November 2026 by setting the archive beside Wikipedia's results pages and World Football Elo Ratings)

Every row is a score on which the two other records agree against the archive; the recent ones were also confirmed from match reports. None is a result awarded afterwards (those are listed separately below). Formline corrects them on its own side (`CORRECTIONS` in `index.html`).

| Date | Home | Archive | Away | Tournament | Should be | Sources |
|---|---|---|---|---|---|---|
| 2026-06-06 | Bermuda | 3–0 | Cape Verde | Friendly | **0–3** | Bernews, 6 June 2026; both teams' Wikipedia pages |
| 2025-11-18 | Mali | 3–2 | Jordan | Friendly | **0–0** | ESPN and FotMob; both teams' Wikipedia pages |
| 2024-11-15 | Russia | 2–1 | Brunei | Friendly | **11–0** | both teams' Wikipedia pages |
| 2026-10-05 | Mauritius | 1–2 | Sri Lanka | Friendly | **2–3** | The Morning, 7 October 2026; Wikipedia and World Football Elo Ratings |
| 2026-06-06 | Jamaica | 0–1 | South Africa | Friendly | **1–1** | SuperSport, 7 June 2026; Wikipedia and World Football Elo Ratings |
| 2026-06-04 | Guatemala | 1–5 | Czech Republic | Friendly | **1–3** | ESPN; Wikipedia and World Football Elo Ratings |
| 2025-08-24 | Qatar | 2–2 | Lebanon | Friendly | **0–1** | ESPN; Wikipedia and World Football Elo Ratings |
| 2022-03-24 | Mauritius | 3–0 | São Tomé and Príncipe | African Cup of Nations qualification | **0–1** | CAF Appeal Board decision, reported by the BBC; Wikipedia and World Football Elo Ratings |
| 2019-03-04 | Barbados | 3–0 | Grenada | Friendly | **0–0** | Wikipedia and World Football Elo Ratings |
| 2017-12-12 | New Caledonia | 0–0 | Solomon Islands | Pacific Mini Games | **0–1** | both teams' Wikipedia pages; World Football Elo Ratings |
| 2016-06-05 | Central African Republic | 3–0 | Angola | African Cup of Nations qualification | **3–1** | Wikipedia and World Football Elo Ratings |
| 2012-09-25 | Taiwan | 1–0 | Macau | Philippine Peace Cup | **2–2** | both teams' Wikipedia pages; World Football Elo Ratings |
| 2011-03-26 | North Korea | 2–0 | Iraq | Friendly | **0–2** | both teams' Wikipedia pages; World Football Elo Ratings |
| 2009-03-14 | Nepal | 4–2 | Sri Lanka | Friendly | **0–0** | both teams' Wikipedia pages; World Football Elo Ratings |
| 2007-06-03 | Mozambique | 3–0 | Burkina Faso | African Cup of Nations qualification | **3–1** | Wikipedia and World Football Elo Ratings |
| 1997-04-04 | British Virgin Islands | 4–2 | Anguilla | CFU Caribbean Cup qualification | **4–1** | both teams' Wikipedia pages; World Football Elo Ratings |
| 1997-03-12 | Saudi Arabia | 3–1 | Indonesia | Friendly | **1–1** | both teams' Wikipedia pages; World Football Elo Ratings |
| 1997-03-09 | Saudi Arabia | 2–0 | Indonesia | Friendly | **4–0** | both teams' Wikipedia pages; World Football Elo Ratings |
| 1996-04-28 | Turkmenistan | 0–1 | Iran | Friendly | **1–0** | both teams' Wikipedia pages; World Football Elo Ratings |
| 1996-03-02 | Malaysia | 1–1 | Indonesia | AFC Asian Cup qualification | **0–0** | both teams' Wikipedia pages; World Football Elo Ratings |
| 1993-04-10 | Ghana | 0–0 | Liberia | African Cup of Nations qualification | **1–0** | Wikipedia and World Football Elo Ratings |
| 1993-02-10 | Mexico | 0–2 | Romania | Friendly | **2–0** | Wikipedia and World Football Elo Ratings |
| 1991-09-20 | New Caledonia | 3–1 | Vanuatu | South Pacific Games | **3–0** | both teams' Wikipedia pages; World Football Elo Ratings |
| 1990-08-29 | Seychelles | 3–1 | Comoros | Indian Ocean Island Games | **2–1** | Wikipedia and World Football Elo Ratings |
| 1988-11-10 | Kenya | 2–0 | Tanzania | CECAFA Cup | **0–0** | Wikipedia and World Football Elo Ratings |
| 1988-04-21 | El Salvador | 1–0 | Guatemala | Friendly | **1–1** | Wikipedia and World Football Elo Ratings |
| 1988-02-16 | China | 1–1 | India | AFC Asian Cup qualification | **1–0** | both teams' Wikipedia pages; World Football Elo Ratings |
| 1985-04-21 | Bolivia | 4–0 | Venezuela | Friendly | **4–1** | Wikipedia and World Football Elo Ratings |
| 1985-04-17 | Colombia | 2–0 | Paraguay | Friendly | **1–0** | Wikipedia and World Football Elo Ratings |
| 1981-08-02 | Suriname | 1–1 | Trinidad and Tobago | CFU Caribbean Cup qualification | **0–0** | Wikipedia and World Football Elo Ratings |
| 1974-01-25 | Panama | 1–0 | El Salvador | Friendly | **1–1** | Wikipedia and World Football Elo Ratings |
| 1973-06-14 | Mauritius | 1–1 | Tanzania | African Cup of Nations qualification | **0–0** | Wikipedia and World Football Elo Ratings |
| 1970-11-20 | Indonesia | 1–3 | Malaysia | King's Cup | **0–3** | Wikipedia and World Football Elo Ratings |
| 1970-11-15 | Indonesia | 4–1 | Cambodia | King's Cup | **4–2** | Wikipedia and World Football Elo Ratings |
| 1969-08-20 | Vanuatu | 7–2 | Solomon Islands | South Pacific Games | **2–7** | both teams' Wikipedia pages; World Football Elo Ratings |
| 1969-03-22 | Morocco | 2–0 | Algeria | African Cup of Nations qualification | **1–0** | Wikipedia and World Football Elo Ratings |
| 1968-11-26 | Indonesia | 7–0 | Singapore | King's Cup | **7–1** | Wikipedia and World Football Elo Ratings |
| 1961-12-27 | Ivory Coast | 1–0 | Central African Republic | African Friendship Games | **11–0** | both teams' Wikipedia pages; World Football Elo Ratings |
| 1961-10-28 | Myanmar | 3–0 | South Korea | Friendly | **1–3** | Wikipedia and World Football Elo Ratings |
| 1957-09-07 | Malaysia | 4–2 | Indonesia | Merdeka Tournament | **2–4** | Wikipedia and World Football Elo Ratings |
| 1949-01-25 | Macau | 1–5 | South Korea | Friendly | **0–3** | Wikipedia and World Football Elo Ratings |

### Dates that look wrong (29 rows; updated 15 November 2026)

Each was settled with two other records: World Football Elo Ratings and Wikipedia (API-Football for the match of 2025), and RSSSF for the matches of 1931, 1944, 1955, 1993 and 1994. Five have a wrong score as well.

| Archive date | Home | Archive score | Away | Date in the other records | Score there |
|---|---|---|---|---|---|
| 2025-03-09 | Saint Vincent and the Grenadines | 1–1 | Grenada | **2025-03-06** | same |
| 2024-05-21 | Basque Country | 1–1 | Uruguay | **2024-03-23** | same |
| 2023-09-04 | Mozambique | 3–2 | Benin | **2023-09-09** | same |
| 2019-08-30 | Belize | 1–0 | Saint Vincent and the Grenadines | **2019-09-01** | same |
| 2019-08-28 | Belize | 1–1 | Saint Vincent and the Grenadines | **2019-08-30** | same |
| 1994-09-14 | India | 0–1 | Yemen | **1994-09-23** | **0–2** |
| 1993-04-05 | Antigua and Barbuda | 0–2 | Sint Maarten | **1993-04-02** | **0–1** |
| 1991-06-22 | Philippines | 2–1 | Brunei | **1991-05-06** | same |
| 1979-04-25 | São Tomé and Príncipe | 1–2 | Angola | **1979-07-12** | same |
| 1977-02-27 | Botswana | 0–2 | China | **1977-07-27** | same |
| 1973-04-17 | Kuwait | 4–1 | Qatar | **1973-01-05** | same |
| 1971-10-27 | Mali | 3–1 | Guinea | **1971-06-27** | same |
| 1971-10-27 | Egypt | 3–2 | Morocco | **1971-04-16** | same |
| 1971-10-27 | DR Congo | 3–0 | Zambia | **1971-06-20** | same |
| 1971-10-13 | Zambia | 2–1 | DR Congo | **1971-06-06** | same |
| 1971-10-13 | Guinea | 0–0 | Mali | **1971-06-13** | same |
| 1969-08-10 | Guinea | 4–0 | Togo | **1969-04-13** | same |
| 1960-11-06 | Mexico | 3–0 | United States | **1960-11-13** | same |
| 1960-11-03 | United States | 3–3 | Mexico | **1960-11-06** | same |
| 1955-12-25 | Myanmar | 3–1 | Sri Lanka | **1955-12-23** | same |
| 1955-12-22 | Myanmar | 1–2 | India | **1955-12-20** | **2–5** |
| 1944-10-14 | Barbados | 1–4 | Trinidad and Tobago | **1944-05-10** | same |
| 1944-10-08 | Barbados | 1–1 | Trinidad and Tobago | **1944-05-08** | same |
| 1944-10-04 | Barbados | 1–1 | Trinidad and Tobago | **1944-05-04** | same |
| 1931-03-14 | Guyana | 7–0 | Barbados | **1931-03-20** | same |
| 1931-03-10 | Guyana | 9–0 | Barbados | **1931-03-13** | same |
| 1931-03-08 | Guyana | 0–2 | Trinidad and Tobago | **1931-03-18** | **2–0** |
| 1931-03-06 | Barbados | 1–5 | Trinidad and Tobago | **1931-03-16** | same |
| 1931-03-05 | Guyana | 2–1 | Trinidad and Tobago | **1931-03-11** | **1–1** |

Notes:

- 1931, Martinez Shield in Georgetown: RSSSF's page for the tournament and Elo agree on all six matches.
- 1944, Barbados v Trinidad and Tobago: the archive has these three in October, on days when it also has Trinidad at home to Barbados. Elo and both teams' Wikipedia pages have them on 4, 8 and 10 May.
- 1955, Colombo Cup in Dhaka: RSSSF and Elo have India 5–2 Burma on 20 December. India 2–1 Pakistan (24 December) is missing from the archive.
- 1971: five 1972 Africa Cup of Nations qualifiers are filed in October 1971 and were played between April and June.
- 1994, Qatar Independence Cup: Yemen 2–0 India was the third-place match on 23 September (RSSSF's tournament page, Elo, 11v11). RSSSF's older yearly file agrees with the archive, so RSSSF is split.
- Still open: 1915-05-18 China 0–0 Philippines and 1915-05-19 China 1–0 Philippines (Far Eastern Championship Games), where Elo has three matches: 17 May 1–0, 18 May 0–0, 20 May 1–1.
- July 1938, Trinidad and Tobago v Suriname (three rows): doubtful. RSSSF shows Suriname's opponents on that tour were a Port of Spain XI and a Georgetown club, and that the April 1938 matches in Georgetown that Elo lists were against the N.G.V.B., a rival federation's team and not Suriname's national side.

### Matches the archive does not hold (updated 14 November 2026)

World Football Elo Ratings lists about 4,650 men's matches that are not in the archive. **2,256 of them have been confirmed in a second record**, and 30 more matches came from API-Football with a second record (World Football Elo Ratings or Wikipedia), (a Wikipedia page of one or both teams, or the competition's own page; a few from RSSSF or a federation's report) and are listed, in the archive's own columns plus a source for each, in [`build/store/manual-men.csv`](../build/store/manual-men.csv) in this repository (2,620 rows; 115 matches of Africa were added on 26 November 2026, 63 matches of Ghana, Cameroon, Gabon, Chad, the Central African Republic and DR Congo on 25 November 2026 and 138 matches of Kenya, Uganda, Tanzania, Ethiopia, Zambia, Malawi, Mozambique, Eswatini, Lesotho and Congo on 22 November 2026 in the country-by-country check set out under "Older matches, country by country" below; thirteen were added the same day when the big rival pairs were checked against outside lists, and are set out under "Rival pairs checked against outside lists" below; one is Argentina v Uruguay of 28 September 1924, abandoned within minutes at 0–0 and played again on 2 October, which RSSSF counts as official match 81 of the series; four are the Argentina v Brazil matches of the Superclásico de las Américas of 2011 and 2012 (14 and 28 September 2011, 19 September and 21 November 2012), official matches 897, 898, 909 and 913 in RSSSF's Argentina archive, which the archive lacks though it has the later editions; one is Brazil v Argentina of 5 September 2021, suspended after five minutes and never replayed; two of them are Kuwait's 2018 World Cup qualifiers of 24 and 29 March 2016, awarded 3–0 against it without being played, which the archive lacks though it has the Myanmar v Kuwait one of 17 November 2015). 404 were played since November 2014. They are free to take.

Whole events among the recent ones:

- COSAFA Cup 2024 (26 June to 7 July) and 2025 (4 to 15 June): the archive's COSAFA Cup stops in 2023.
- CECAFA Cup 2019 (7 to 19 December): nine matches.
- EAFF E-1 Championship finals, July 2025 (six matches, including South Korea 0–1 Japan).
- CAFA Nations Cup, 29 August to 8 September 2025 (14 matches).
- AFC Asian Cup qualifiers of 31 March 2026 (12 matches, such as Vietnam 3–1 Malaysia and India 2–1 Hong Kong).
- UEFA Nations League play-outs, 26 and 31 March 2026 (Gibraltar v Latvia, Malta v Luxembourg, both legs).
- Copa Centroamericana 2017: Panama 2–1 Nicaragua and Panama 1–0 El Salvador. The 2017 Gold Cup play-off, Haiti 3–1 Nicaragua and Nicaragua 3–0 Haiti.
- Four-nations tournaments in Malawi and Madagascar, March 2024.

Single matches: Guyana 1–3 Haiti (2019-06-11, a friendly in Alajuela, Costa Rica, before the Gold Cup), Russia 4–0 Serbia (2024-03-21), Mali 2–0 Nigeria (2024-03-26), Egypt 2–1 Nigeria (2025-12-16), Kenya 4–0 Lesotho (2026-06-07), Yemen 2–1 Kuwait (2026-09-18), Japan 3–1 Uruguay (2026-09-24, confirmed from the Japan FA's own report), US Virgin Islands 3–2 Bahamas (2026-10-04, CONCACAF Nations League C).

Older ones (1,882 before November 2014, back to Ireland 4–3 Wales in 1893) include the Olympic Games after 1928, Olympic qualifiers and the Pan Arab Games, which the archive may leave out on purpose; matches against amateur or B sides are not in the list.

Played and later struck from the tables, which the archive leaves out though the matches took place: Nigeria 2–0 Chad (2015-06-13), Chad 1–5 Egypt (2015-09-06) and Chad 0–1 Tanzania (2016-03-23), annulled when Chad withdrew; Sierra Leone 2–1 Kenya (2017-06-10) and Ethiopia 1–0 Sierra Leone (2018-09-09), annulled when Sierra Leone were disqualified.

Abandoned matches that are not in the archive at all, though others like them are (Serbia v Albania 2014, Romania v Kosovo 2024): Montenegro v Russia (2015-03-27, abandoned at 0–0, awarded 0–3), French Guiana v Bermuda (2016-06-01, abandoned with Bermuda leading 1–0, replayed on 19 June), Saudi Arabia v United Arab Emirates (2025-12-18, Arab Cup third-place match, abandoned at half-time at 0–0), Fiji v Solomon Islands (2025-11-22, MSG Prime Minister's Cup third-place match in Port Moresby, abandoned at half-time at 1–1 in heavy rain; the archive holds the rest of that tournament). Also missing: Kyrgyzstan 1–0 Afghanistan (2023-06-10, CAFA Nations Cup, later recorded as 3–0).

### Awarded results (same check)

In about 35 competitive matches the archive holds a 3–0 that was awarded afterwards, where the other two records hold the score on the pitch (for example South Africa 2–0 Lesotho on 21 March 2025, awarded 0–3; the six Timor-Leste qualifiers of 2015). One runs the other way: Romania v Kosovo on 15 November 2024 is in the archive as 0–0, the score when it was abandoned, though it was awarded 3–0. Not errors, but the archive is not consistent about which it records.

### Duplicated matches

| Date | Home | Score | Away | Tournament | Venue | neutral |
|---|---|---|---|---|---|---|
| 1925-05-20 | China | 2–0 | Japan | Friendly | Manila, Philippines | TRUE |
| 1925-05-20 | Japan | 0–2 | China | Far Eastern Championship Games | Manila, Philippines | TRUE |
| 1921-05-30 | Japan | 0–3 | Philippines | Friendly | Shanghai, China | TRUE |
| 1921-05-30 | Philippines | 3–1 | Japan | Far Eastern Championship Games | Shanghai, China | TRUE |
| 1974-02-17 | Tahiti | 2–1 | New Caledonia | Friendly | Papeete, Tahiti | FALSE |
| 1974-02-17 | Tahiti | 1–2 | New Caledonia | Friendly | Papeete, Tahiti | FALSE |
| 1982-02-16 | Nepal | 1–1 | Bangladesh | Quaid-e-Azam International Tournament | Karachi, Pakistan | TRUE |
| 1982-02-16 | Bangladesh | 1–1 | Nepal | Friendly | Karachi, Pakistan | TRUE |
| 1982-02-17 | Oman | 1–0 | Nepal | Quaid-e-Azam International Tournament | Karachi, Pakistan | TRUE |
| 1982-02-17 | Nepal | 0–1 | Oman | Friendly | Karachi, Pakistan | TRUE |
| 1982-02-19 | Oman | 3–1 | Bangladesh | Quaid-e-Azam International Tournament | Karachi, Pakistan | TRUE |
| 1982-02-19 | Bangladesh | 1–3 | Oman | Friendly | Karachi, Pakistan | TRUE |

China v Japan 1925 and Japan v Philippines 1921 each appear once as a Friendly and once as a Far Eastern Championship Games match on the same day; the three 1982 Karachi matches appear once as Friendlies and once as Quaid-e-Azam International Tournament matches; Tahiti v New Caledonia 1974 appears twice with opposite scores.

### A row with the wrong opponent (found 21 November 2026)

| Date | Home | Score | Away | Tournament | Venue |
|---|---|---|---|---|---|
| 2017-05-13 | Egypt | 1–0 | Libya | Friendly | Cairo, Egypt |

Egypt's opponent in Cairo on 13 May 2017 was Yemen, not Libya (ESPN's match page, with Hesham Mohamed's goal; API-Football fixture 225775). It was played by Egypt's home-based team, and Wikipedia (Hesham Mohamed's page) calls it an unofficial friendly. Egypt v Libya, also 1–0, was played on 5 June 2017 and is in the archive on that date as well. Formline leaves the 13 May row out.

### Victory Internationals of 1945–46 filed as friendlies (9 rows; found 22 November 2026)

| Date | Home | Score | Away | Venue | Counted as a full international by |
|---|---|---|---|---|---|
| 1945-05-26 | England | 2–2 | France | London | France only |
| 1945-07-21 | Switzerland | 3–1 | England | Bern | Switzerland only |
| 1945-09-15 | Northern Ireland | 0–1 | England | Belfast | neither |
| 1945-10-20 | England | 0–1 | Wales | Birmingham (West Bromwich) | neither |
| 1946-01-19 | England | 2–0 | Belgium | London | Belgium only |
| 1946-04-13 | Scotland | 1–0 | England | Glasgow | neither |
| 1946-04-24 | England | 2–2 | Scotland | Manchester | neither |
| 1946-05-11 | England | 4–1 | Switzerland | London | Switzerland only |
| 1946-05-19 | France | 2–1 | England | Colombes | France only |

England, Wales and Ireland count none of the Victory Internationals as full internationals; France, Belgium and Switzerland count theirs; Scotland counts only its matches with Belgium (23 January 1946) and Switzerland (15 May 1946), which are also in the archive and are full internationals for both sides (Wikipedia, "Victory International"; RSSSF, "England – War-Time/Victory Internationals", headed "All matches are unofficial", and "Scotland – Unofficial Matches"; RSSSF's England–France list marks both matches "official for France but not" for England). The archive holds these nine but not the other three of the series (Scotland 2–0 Wales, 10 November 1945; Ireland 2–3 Scotland, 2 February 1946; Wales 0–1 Ireland, 4 May 1946).

The England 2–2 Scotland row is the Bolton Disaster Fund match at Maine Road, which was played on 24 August 1946, not 24 April (RSSSF, "Scotland Unofficial Matches 1946–1959"; London Hearts' Scotland records). 11v11 carries the same April date as the archive.

Formline leaves all nine out, as it leaves out matches against England's amateur side: with them, England v Scotland comes to 118 meetings against the official 116, England v Wales to 106 against 105, and England v Northern Ireland to 99 against 98.

### Older matches, country by country (begun 22 November 2026)

About 1,880 matches before 2014 are in World Football Elo Ratings and not in the archive, and had no second record. Each is now looked up in RSSSF's list of the country's internationals. A match goes in when RSSSF has it with the same score and without its mark for "unsure of status/not a full international" (an asterisk). Where the two give different days, Elo's is used and RSSSF's is named in the row's source. A match the archive already holds under another date is not added again.

**Kenya and Uganda** (RSSSF's lists by Barrie Courtney; 82 open matches looked at). 38 added: Ethiopia 7–1 Kenya (Olympic qualifier, 10 November 1963; RSSSF 13 November); Kenya's African Cup of Nations qualifiers of 1965 against Ethiopia (3–2 on 14 February, which RSSSF notes was later awarded to Ethiopia, and 1–2 on 4 April) and Sudan (2–4 on 11 April, 1–1 on 25 April); Kenya 3–4 Zambia, 19 December 1967; Kenya's friendlies of 1972, 1975–77, 1983, 1988, 1991–92 and 1996–97 with Tanzania, Ethiopia, Mauritius, Congo, Zambia, Malawi, Ivory Coast and Egypt; Tanzania 0–0 Kenya in the CECAFA Cup, 26 October 1974; the Olympic qualifiers of 1987 (Egypt v Kenya twice; Uganda v Mozambique and Zambia twice each); Uganda 0–2 Ghana, 1 December 1962; Congo 0–0 Uganda, 6 March 1969; Uganda 5–2 Somalia, 30 November 1972; Uganda 3–2 Rwanda, 14 November 1996; Uganda 0–0 Kenya, 4 April 1999; Uganda 3–1 Tanzania, 28 May 2003.

Left out, with the reason:

- RSSSF marks them as doubtful or not full internationals: Sudan 4–3 Kenya (12 April 1965), Kenya 1–0 Lesotho (15 December 1973), Tanzania 0–3 Kenya (11 November 1991), Malawi 0–0 Kenya (6 July 2008), Uganda 3–0 Libya (29 October 1972).
- RSSSF does not list them: Réunion 3–1 Kenya and Madagascar 0–3 Kenya (September 1959), Sudan 4–2 Kenya (1 January 1970), Kenya 0–0 Zanzibar (28 September 1971), Zanzibar v Kenya twice (July 1996), Malta 4–0 Uganda (6 October 1956), Tanzania 1–2 Uganda and Uganda 1–0 Somalia (January 1974), Zambia 2–1 Uganda (26 June 1999).
- The records conflict: Tanzania v Uganda on 5 and 7 December 1949 (RSSSF has a single 0–0 on 6 December); Egypt 3–0 Uganda, 2 October 2013 (RSSSF has 3–0 on 13 August and a doubtful 2–0 on 30 September, which the archive holds).
- No day is known: Uganda 7–2 Southern Rhodesia, 1959 (both records have it, neither dates it).
- Uganda 3–1 Guinea, 2 September 2000, was first held and went in with the second batch (see below).
- Dates in doubt, not changed: Ethiopia 0–0 Uganda and Uganda 2–1 Ethiopia (African Cup of Nations qualifiers) are 12 and 26 June 1977 in the archive, 2 and 9 October 1977 in both Elo and RSSSF.

**Tanzania, Ethiopia, Zambia and Malawi** (RSSSF's lists by Barrie Courtney, with Zimbabwe's read for the matches between them; about 125 open matches looked at). 48 added:

- Tanzania: 3–0 Ethiopia (7 July 1973), 4–1 Lesotho (9 December 1973; RSSSF 12 December), 1–0 Zambia (CECAFA Cup, 30 October 1974), Mozambique 1–2 Tanzania (20 December 1977), Tanzania v Mozambique 2–3 and 2–1 (4 and 8 February 1987), 3–2 Zanzibar (29 September 1997), Ethiopia 3–0 Tanzania and Tanzania 3–1 Ethiopia (14 April and 1 May 2002), 2–0 Burundi (CECAFA Cup, 4 December 2010).
- Ethiopia: the Olympic qualifiers with Egypt (1–4 and 2–5, 1956), Madagascar (1–2, 12 May 1979), Zimbabwe (2–3 and 1–0, October 1983) and Cameroon (0–4 and 1–1, early 1984); 2–0 Ghana (1 February 1976); Egypt 2–1 Ethiopia (10 November 1977); 3–0 Benin (26 March 2003).
- Zambia: the Olympic qualifiers with Sudan (2–2, 28 March 1976), Egypt (1–0 and 0–2, October 1983) and Ghana (2–0 and 0–1, January 1988); 3–0 Nigeria (25 July 1981); Eswatini 1–0 Zambia (19 April 1989); Zimbabwe 2–2 Zambia (21 December 1996); 2–0 Burkina Faso (13 December 1997); DR Congo 0–0 Zambia (15 November 2008).
- Malawi: Lesotho 4–3 Malawi (2 October 1966); 1–1 Eswatini (9 July 1969); Mozambique 1–0 Malawi (4 November 1981); the Olympic qualifiers with Rwanda (5–2 and 3–0, November 1986) and Cameroon (1–1 on 27 June 1987, RSSSF 17 June, and 0–3); Eswatini 0–0 Malawi (23 January 1990); Zanzibar 1–1 Malawi (28 May 2012); 0–1 Mozambique (6 July 2013).
- Eight qualifiers that were played and later annulled, which is why the archive lacks them: Tanzania 2–2 Ghana and Liberia 1–1 Tanzania (African Cup of Nations qualifiers, August 1992; Tanzania withdrew), Lesotho 0–2 Malawi (22 January 1995; Lesotho withdrew), Uganda 3–1 Guinea (2 September 2000; Guinea was disqualified), and Ethiopia's four World Cup qualifiers of 2008 (Morocco 3–0, Rwanda 1–2, Mauritania 1–0 away and 6–1 at home; Ethiopia was excluded). The archive already holds Tanzania's annulled World Cup qualifiers of 1992, so these are treated the same way. With them in, the tournament lines for Tanzania (1994), Lesotho (1996) and Ethiopia (2010) no longer read "Did not play qualifying".

Two archive dates put right, Elo and RSSSF agreeing: Malawi 4–1 Lesotho was played on 28 February 1976 (archive 8 February), and Botswana 2–1 Zambia on 1 October 1989 (archive 1 December).

Left out, with the reason:

- RSSSF marks them as doubtful or not full internationals: every match of Southern Rhodesia before 1980 in Zimbabwe's list (so Malawi v Southern Rhodesia in 1964, 1967 and 1969, and the Levy Cup matches with Northern Rhodesia of 1951–62); Tanzania's matches before independence; Zambia 4–1 Malawi (20 July 1964, asterisked in Zambia's list though not in Malawi's); Zambia 2–0 Madagascar (1967); Tanzania 3–1 Congo (7 June 1975); Ethiopia 3–0 China (8 December 1974); Zambia 1–1 Angola (2 November 1981); Saudi Arabia 1–0 Zambia (1986); Zambia's Blair Cup matches of August 1988; Ethiopia 4–1 Nigeria (28 May 1992); Zambia 1–0 Mozambique (28 December 2009), Nigeria 0–0 Zambia (6 January 2010) and South Africa 1–1 Zambia (11 January 2012); Cuba 1–0 Zambia at the 1980 Olympic Games.
- RSSSF does not list them: Tanzania v Zanzibar in the Gossage Cups of 1953–55 and on 24 December 1972; Lesotho v Tanzania twice (October 1973); Tanzania's three matches of January 1974; Tanzania 3–0 Mozambique (9 December 1975); Mozambique v Tanzania three times (June and July 1976); Tanzania 2–0 Mozambique (8 February 1977); Zambia 3–0 Nigeria (28 July 1981); Yemen DPR 1–0 Ethiopia (1983); Libya v Ethiopia twice (March 1992); Zimbabwe v Zambia twice (August 1995).
- The records conflict: Tanzania 1–0 Congo (8 July 1973; RSSSF 2–1 on 5 July, which the archive holds); Mozambique 3–2 Tanzania (26 June 1975; RSSSF 2–1 on 25 June); Mozambique 0–0 Malawi (22 June 1988; RSSSF 14 June, where the archive has 1–1); Tunisia 1–3 Malawi (6 December 1987; RSSSF and the archive have 2–3 on 2 December); Ethiopia 1–1 Sudan (1 June 2011; RSSSF has Sudan winning 2–1 on 28 May).
- No day is known: Ethiopia 4–0 Tanzania, January 1963 (both records).
- Abandoned: Malawi 0–1 Lesotho, 2 March 1976 (RSSSF: abandoned after 53 minutes). To go in marked as abandoned.
- Not yet looked up: Ethiopia 1–1 Malawi (CECAFA Cup, 4 December 2010).

**Mozambique, Eswatini, Lesotho, Botswana, Congo and Zanzibar** (RSSSF's lists by Barrie Courtney; about 155 open matches looked at). 52 added:

- Mozambique: 3–1 Zimbabwe (1 July 1980); 1–2 Madagascar (28 June 1981); 2–0 Lesotho (13 August 1981); the Olympic qualifiers of 1983 with Lesotho (3–0, 0–0) and Zimbabwe (0–1, 0–2); 0–3 Angola (25 June 1985); Guinea-Bissau 3–3 Mozambique (Cape Verde, 7 July 1985); 1–0 Algeria (7 January 1996); Eswatini 1–1 Mozambique (12 December 1997); 0–1 Ghana (25 June 2004); Namibia 3–0 Mozambique (22 February 2012).
- Eswatini: the Olympic qualifiers with Zimbabwe (0–2 and 1–6, June 1987); Botswana 2–1 Eswatini (31 July 1988).
- Lesotho: Namibia 1–0 Lesotho (Eswatini, 6 January 2001).
- Congo: 5–1 Cameroon (28 November 1961); 4–2 Chad and 10–0 Niger (Jeux de l'Amitié, Abidjan, December 1961); 3–1 Senegal (29 March 1964); 4–1 Chad and 2–1 Gabon (Coupe des Tropiques, July 1964); DR Congo 2–1 Congo (25 December 1965); Ghana 3–0 Congo (Kinshasa, 1 July 1966); Senegal 1–0 Congo (10 December 1967); Ivory Coast 0–0 Congo (22 December 1968); 2–0 Gabon (3 February 1969); 7–1 Chad (13 July 1972); Cameroon 3–1 Congo (UDEAC Cup final, 23 July 1975); Chad 2–2 Congo (13 June 1976); the Central African Games of 1976 (2–1 Central African Republic, 4–1 Chad, 1–0 Gabon, 2–3 Cameroon), 1981 (2–1 Gabon, 3–1 Angola, 0–0 Cameroon) and 1987 (0–3 Cameroon, 3–2 Gabon); 2–0 DR Congo (1 December 1977); Burkina Faso 0–0 Congo (30 July 1984); 0–0 Senegal (26 November 1989).
- Nine more annulled African Cup of Nations qualifiers: Congo 2–0 Chad (30 August 1992; Chad withdrew), Congo 1–1 Gambia and Gambia 1–1 Congo (September 1994 and April 1995; Gambia withdrew), Lesotho's five of 1994–95 (Zimbabwe 5–0, Cameroon 2–0 for Lesotho, DR Congo 3–0, Zimbabwe 2–0, Cameroon 4–1; Lesotho withdrew), and Ghana 1–0 Mozambique (24 January 1999; Ghana became co-host). Wikipedia's pages for the 1994 and 1996 qualifying competitions confirm the withdrawals and the annulments.

Two more archive dates put right, Elo and RSSSF agreeing: Congo 4–4 Cameroon and Congo 11–0 Chad were played on 14 February and 28 March 1965, not 1964.

Left out, with the reason:

- **The CEMAC Cup, 2003 to 2007** (Congo's twelve matches with Gabon, the Central African Republic, Equatorial Guinea and Chad). Both records have them and RSSSF does not mark them, but the archive holds no CEMAC Cup match at all and the competition was for home-based players. Held until a third record says whether the associations count them.
- RSSSF marks them as doubtful: Congo's matches before independence and at the Jeux de l'Amitié of 1960; Congo 3–1 Northern Rhodesia (1961); Ivory Coast 1–1 Congo (30 November 1969); Botswana 3–1 Eswatini (30 September 1974); Botswana 1–0 Zimbabwe (30 September 1988); Eswatini 4–4 Zimbabwe (1 April 1990); South Africa 1–0 Eswatini (29 May 2008); Malawi 1–0 Lesotho (23 May 2009); Ivory Coast 1–0 Zanzibar (1 December 2010); Mozambique 0–0 Eswatini (13 March 2013). Malawi 0–1 Lesotho of 2 March 1976 is both abandoned and asterisked in Lesotho's list.
- RSSSF does not list them: every Mozambique match before June 1975 (thirteen with Angola from 1965 to 1972, one with Eswatini); the independence-day matches between Eswatini, Botswana and Lesotho from 1970 to 1978 (eleven); Mozambique's matches with Tanzania, Zanzibar and Congo in 1975–77; Mozambique 0–0 Zimbabwe (21 June 1981); Zanzibar v China twice (December 1971) and v Lesotho (1973); Congo 4–2 Romania (1968); Congo's three matches at the Francophone Games of 1989; Réunion 1–1 Congo (1987); South Africa 5–0 Lesotho (2007) and 6–2 Eswatini (2010).
- The records conflict: Togo 1–3 Congo (Elo 16 April 1975, RSSSF 6 April); Gabon v Mozambique in January 2010 (Elo 1–0 on the 3rd; RSSSF and the archive 2–0 on the 6th).
- Possibly already held under another date: DR Congo 4–1 Congo (Elo and RSSSF 3 July 1966; the archive has the same score on 22 January 1967); Congo 2–0 Togo (Elo and RSSSF 12 February 1984; the archive has the same score on 24 March 1983). Malawi 8–1 Botswana and Eswatini 2–0 Malawi are 13 and 20 July 1968 in the archive and on Wikipedia, 6 and 7 September 1968 (Eswatini's independence) in Elo and RSSSF.
- Two matches on one day: Zimbabwe 6–1 Mozambique (19 April 1981, a tournament in Zimbabwe) was played the day Mozambique drew 3–3 with Zaire in a qualifier at home; one of the two sides was not the first team.
- Abandoned: Cameroon 1–2 Congo (30 December 1977, abandoned after 84 minutes).

**Ghana, Cameroon, Gabon, Chad, the Central African Republic and DR Congo** (25 November 2026; RSSSF's lists by Barrie Courtney; about 140 open matches looked at). 63 added:

- Ghana (23): 5–0 Nigeria (24 February 1963); Ivory Coast 1–0 Ghana (2 January 1965); DR Congo 2–0 Ghana (30 April 1967); 0–0 Ivory Coast (16 May 1968); Togo 2–7 Ghana (1 September 1971); Ivory Coast 0–3 Ghana (12 September 1976); 4–1 Mali (25 June 1978); 1–0 South Korea (Merdeka Tournament, 17 August 1982); Guinea 0–1 Ghana (in Gambia, 4 February 1984); 2–0 Sierra Leone (12 November 1995); the Olympic qualifiers with Senegal (1972 and 1987), Liberia (1980), Gambia and Nigeria (1983) and Cameroon (1987); and three annulled African Cup of Nations qualifiers (3–0 Burkina Faso, 30 August 1992; Gambia 1–2 Ghana, 12 November 1994; Cameroon 1–3 Ghana, 4 October 1998).
- Cameroon (16): 9–0 Chad (16 April 1965) and 3–0 Chad (3 January 1978) in All-African Games qualifying; 5–0 Mali (Guinea, 28 September 1966); Senegal v Cameroon twice (March 1967); the Central African Games of 1976 (5–0 Rwanda, 5–0 Burundi, 0–0 Gabon, 3–0 Central African Republic), 1981 (0–0 Angola, 0–0 Gabon) and 1987 (2–0 Gabon, 3–0 Chad); the Olympic qualifiers with Angola (1983); 0–1 Egypt (19 July 1992).
- Gabon (12): 2–1 Chad (Coupe des Tropiques, 12 July 1964); 3–1 Central African Republic (30 November 1966); 2–2 Ivory Coast (24 March 1967); the Central African Games of 1976 (4–1 Burundi, 3–0 Rwanda, 3–1 Central African Republic), 1981 (1–1 Angola) and 1987 (3–1 Chad); the Olympic qualifiers with Tunisia (1983); 4–0 Mali (23 November 1988); 2–3 Tunisia (3 January 1989).
- Chad and the Central African Republic (5): Chad 2–3 Togo (30 April 1965); Central African Republic 1–0 Chad (1 May 1972, and again at the Central African Games on 2 July 1976); Equatorial Guinea 2–0 Chad (8 February 2011); Central African Republic 1–1 Burkina Faso (Jeux de l'Amitié, 26 December 1961).
- DR Congo (7): 2–0 Senegal (27 March 1964); 1–0 Central African Republic and 1–0 Gabon (Coupe des Tropiques, July 1964); 8–2 Central African Republic (16 April 1965); Togo 0–0 DR Congo (23 November 1975); Angola v DR Congo 1–2 and 0–2 (27 and 29 June 1990).

Three archive dates put right, Elo and RSSSF agreeing: Ghana 4–1 DR Congo was played on 3 January 1965 (archive 14 April 1965, a day DR Congo played Cameroon); Ghana 0–1 Togo on 27 June 1971 (archive 27 October); DR Congo 4–1 Congo on 3 July 1966 (archive 22 January 1967).

Left out, with the reason:

- **The CEMAC Cup** (about thirty matches from 2003 to 2007 between Congo, Gabon, Chad, the Central African Republic and Equatorial Guinea). RSSSF's page for the 2008 edition says most if not all teams used home-based players only; its lists asterisk Cameroon's matches in it and Chad's of 2010. Held as a block.
- Before independence, so the other side's standing is not known: Gold Coast 2–0 French Tunisia (31 May 1954), Ghana 3–2 French Togoland (13 February 1958), and the undated matches of 1938 to 1959.
- RSSSF marks them as doubtful: Bulgaria 10–0 Ghana (1968) and Poland 4–0 Ghana (1972) at or before the Olympic Games; Ghana 1–1 Sierra Leone (1 December 1972); Ghana's matches of 4 and 6 February 1987; Ghana 1–0 Guinea (26 March 1989); Ghana 2–2 Mali (27 June 1991); Benin 0–0 Ghana (1996; RSSSF 18 September); Cameroon's LG Cup matches of 2003.
- RSSSF does not list them: Ghana v Ukraine twice (1966), Togo 1–0 Ghana (1964), Ghana 2–1 Benin (1967), Togo 2–0 Ghana (1976), Gambia 0–1 Ghana (1990), Ghana 1–0 Burkina Faso and Nigeria 0–0 Ghana (1991), South Korea 3–1 Ghana (1993), Senegal 1–1 DR Congo (1965), Gabon 0–2 Togo (1979), DR Congo 3–1 Guinea (1980), Algeria 3–1 Chad (2010), and the Francophone Games of 1989.
- The records conflict: China v Ghana, 29 May 1978 (Elo has China winning 2–0, RSSSF Ghana).
- No day in one record or both: Gabon v Equatorial Guinea twice (1966), Benin 1–0 Gabon and Ivory Coast 2–0 Gabon (1971), Ivory Coast 2–2 Cameroon and Mali 0–0 Cameroon (September 1964), Ghana 1–1 Sierra Leone (June 1967), Ivory Coast 2–2 Ghana (March 1978), Saudi Arabia 1–1 Cameroon (1983).
- Abandoned: Ivory Coast 2–1 Central African Republic (22 April 1973, abandoned at half-time), as well as Cameroon 1–2 Congo (30 December 1977).

**West and North Africa** (26 November 2026; RSSSF's lists by Barrie Courtney for Senegal, Ivory Coast, Togo, Benin, Burkina Faso, Guinea, Mali, Sierra Leone, Liberia, Gambia, Guinea-Bissau, Niger, Tunisia, Algeria, Morocco, Libya and Sudan, and RSSSF's older list for Nigeria; about 340 open matches looked at). 99 added, and two abandoned matches shown:

- All-African Games qualifying in Lagos, December 1964 to January 1965 (6): Dahomey 4–2 Niger, Nigeria 6–1 Upper Volta, Upper Volta 2–0 Dahomey, Togo 2–1 Upper Volta, Dahomey 2–2 Togo, Niger 2–2 Upper Volta. And of 1972 (5): Upper Volta 2–0 Niger, Dahomey 3–2 Upper Volta, Niger 2–2 Dahomey, Upper Volta 3–1 Dahomey, Dahomey 1–0 Niger. And of January 1978 (2): Nigeria 2–0 Benin, Libya 1–0 Tunisia.
- Olympic qualifiers (20): Libya v Algeria (1967, both legs); Nigeria 1–1 Senegal (1971); Togo 1–1 Senegal (1975); Mauritania v Gambia, Senegal v Benin, Nigeria v Togo and Sudan v Egypt (1983, both legs of each); Sierra Leone v Tunisia, Liberia v Nigeria and Sudan v Algeria (1987, both legs of each); Algeria v Nigeria (January 1988, both legs).
- Played and later annulled (18): Burkina Faso 1–1 Liberia (16 August 1992); Togo's six 1994 African Cup of Nations qualifiers (Senegal 2–0, 0–0 Algeria, 0–0 Guinea-Bissau, Sierra Leone 0–0 in Guinea, 1–1 Senegal, Algeria 4–0); Guinea-Bissau's three of 1994 (1–3 Tunisia, Mauritania 1–1, 1–4 Senegal); Sierra Leone 2–0 Gambia (7 January 1995); Sudan 0–3 Zimbabwe (6 October 1996); Morocco 3–0 Sierra Leone (3 October 1998); Nigeria's three of 1998–99 (Burkina Faso 0–0, 2–0 Burundi, Senegal 1–1); Guinea's two World Cup qualifiers of 2000 (3–0 Zimbabwe, Burkina Faso 2–3). Wikipedia's pages for the 1994, 1996, 1998 and 2000 qualifying competitions give the withdrawals; RSSSF's page for the 2000 tournament marks Nigeria's and Sierra Leone's matches annulled.
- Other competitive matches (6): Ivory Coast 2–0 Upper Volta (African Cup of Nations qualifier, 31 March 1977); Algeria 0–1 Tunisia (African Cup of Nations qualifier, 22 January 1999); Egypt 2–1 Libya and Libya 3–2 Lebanon (Pan Arab Games, Casablanca, September 1961); Algeria 1–1 Tunisia (Mediterranean Games, Split, 23 September 1979); Malaysia 2–0 Morocco (Merdeka Tournament, 15 October 1980).
- Friendlies and small tournaments (the rest): Liberia 2–0 Ivory Coast (1960); Gambia v Senegal twice (1961); Liberia 1–0 Gambia (1965); Senegal v Mali twice (1968); Dahomey 1–0 Gabon (1971); Guinea 3–2 Cuba and Algeria 0–1 Cuba (May 1974); Upper Volta 3–1 Senegal (1974); Niger 4–1 Upper Volta and Mali 0–0 Ivory Coast (1975); the Zone II tournament in Bissau (Guinea-Bissau 1–1 Senegal and Mali 3–1 Senegal, June 1975; Gambia 2–2 Mali, April 1977); Mali 0–0 Gambia (1983); Congo 2–0 Togo (1984); Mali 1–2 Niger and Gambia 0–0 Senegal (1989); Morocco 0–0 Senegal (1990); Niger 0–0 Togo (1994); Egypt 0–0 Mali (1996); Mali 0–0 Senegal, Kuwait 8–1 Mali and United Arab Emirates 3–0 Togo (1997); Togo 1–2 Burkina Faso (1999); Benin 0–1 Equatorial Guinea (2006); Morocco 3–1 Syria (1958); Tunisia 8–1 Taiwan (in Italy, 1960); Algeria 1–1 Egypt (1963); Morocco 0–1 Uruguay (1964); Libya 0–1 Sudan (1970); Algeria 1–2 Tunisia (1974); Kuwait 0–1 Tunisia (1987); Tunisia 1–0 Algeria and United Arab Emirates 2–0 Algeria (1988); Egypt v Tunisia three times (1989; RSSSF has 30 May for the first, Elo 29 May); Tunisia 1–1 Algeria (1992); Oman 0–1 Algeria twice (May 1996).

Two abandoned matches shown and never rated: Tunisia 2–2 Nigeria (African Cup of Nations qualifier, 10 December 1961, stopped after 64 minutes and awarded 2–0 to Tunisia) and Nigeria 1–1 Tunisia (third-place match of the 1978 African Cup of Nations, 16 March 1978, stopped after 42 minutes when Tunisia left the field and awarded 2–0 to Nigeria; RSSSF's Nigeria list has 17 March).

Three archive dates put right, Elo and RSSSF's lists for both sides agreeing: Togo 0–2 Ivory Coast was played on 9 April 1967 (archive 16 August); Upper Volta 0–1 Mali on 12 February 1967 (archive 15 November); Mali 4–0 Upper Volta on 26 February 1967 (archive 27 September). That leaves the archive with two Upper Volta home matches on 12 February 1967: RSSSF has the other, Upper Volta 1–2 Algeria, on 11 January 1967, but Elo does not differ from the archive there, so it stays.

Left out, with the reason:

- **The West African (CSSA) Nations Cup of 1987 in Monrovia** (nine matches). RSSSF's Liberia list says Nigeria and Togo sent under-20 sides, and its Togo list asterisks every match.
- **The CEDEAO matches of June and July 1991 in Nigeria** (nine matches): RSSSF asterisks them ("CEDEAO Commemorative Match") or does not list them. Likewise Gambia 0–1 Ghana (28 May 1990).
- **CECAFA Cup 2010, Ivory Coast as guests** (three matches): asterisked; and Nigeria 0–0 Zambia (6 January 2010), which RSSSF lists as not a full international (two halves of 40 minutes behind closed doors).
- Sides before independence or before a federation existed: Algeria's FLN team (1958–60) and the Algeria v Tunisia league selections of 1932–35; French Togoland, French Dahomey, French Sudan and the Ivory Coast selections of 1954–60; Libya 15–1 Oman and Egypt 14–0 Aden at the 1965 Pan Arab Games.
- RSSSF marks them as doubtful: Senegal 1–1 DR Congo (1965, abandoned); Senegal 4–4 Guinea (1968); Ivory Coast 1–1 Congo (30 November 1969); Guinea 1–2 Cuba (14 May 1974); Guinea 1–0 Senegal (26 November 1980); Senegal 1–1 South Korea B (1982); Guinea-Bissau 3–1 Guinea (1987); Nigeria 1–1 Benin (2 January 1965); Hungary v Tunisia (1959, 1960); Switzerland v Morocco (1961, 1966); Morocco 2–2 Egypt (1961); Libya's tournament of March 1964; Libya 3–2 Egypt (7 July 1970) and Libya 2–2 Algeria (5 July 1970, asterisked in Libya's list only); the Soviet Union v Algeria (1971); Saudi Arabia 1–1 Tunisia (Arab Cup 1988); United Arab Emirates 0–0 Mali (1997); Libya 2–0 Ivory Coast (2000); the Arab Cup qualifiers of December 2002; Libya 3–0 Sudan (2007); Qatar 5–2 Libya (2008); Algeria 3–1 Chad (2010); Egypt 1–1 Sudan (2012); Ivory Coast 2–1 Mali (2012); the friendlies of Niger, Gambia, Togo and Equatorial Guinea in 2013.
- The records conflict: Morocco 2–1 Nigeria (Olympic play-off, March 1964: Elo 26 March in Dakar, RSSSF's Morocco list 28 March, its Nigeria list 24 March in Cairo); Tunisia v Egypt (Olympic qualifiers, 4 October and 13 November 1987: Elo and RSSSF give opposite venues); Algeria 3–0 Morocco (Olympic qualifier, December 1979: Elo 24 December, RSSSF 21 December); Upper Volta v Niger (29 October 1972: 2–1 in Elo, 2–0 in RSSSF); Gambia v Burkina Faso (7 July 2001: 1–0 in Elo, 0–0 in RSSSF); Saudi Arabia v Morocco (September 1976: opposite winners); Kuwait 3–3 Morocco (1982: different day and venue); Tunisia v Malawi (December 1987); Cape Verde v Senegal (1 July 1990); Togo 1–3 Congo (April 1975); Liberia 0–0 Senegal (6 May 1967, where RSSSF and the archive have 1–1 on 9 April); Ghana 2–1 Benin (1967); Ethiopia v Sudan (2011).
- RSSSF does not list them: the Soviet Union's matches with Algeria (1964, 1966, 1968), Tunisia (1967) and Senegal (1969); Hungary v Senegal (1971) and Morocco (1963); Ivory Coast v Senegal twice (1968); Ivory Coast v Niger twice (1968); Sierra Leone v Guinea (1972, 1974, 2010); Liberia 1–0 Ivory Coast (1974); Liberia 3–1 Sierra Leone (1975); Ivory Coast 1–2 Upper Volta (27 July 1975); Togo's friendlies of 1964, 1976 and 1979; Nigeria 3–2 Libya (1967); Libya 2–3 Tunisia (1965); Uganda 3–0 Libya (1972); Libya 0–1 South Korea (1976); Algeria's matches at the 1985 Pan Arab Games and the 1988 Arab Cup; Canada 3–1 Burkina Faso (1989); Libya v Ethiopia twice (1992); Guinea-Bissau 1–4 Ivory Coast (2001); Ivory Coast, Liberia and Equatorial Guinea in February 2009; Egypt 4–0 Libya (2012).
- No day in one record or both: the matches of 1938 to 1959 without a date; Sierra Leone v Gold Coast (1956, 1957); Ghana 1–1 Sierra Leone (June 1967); Cape Verde 2–0 Guinea-Bissau (July 1978); the Cape Verde tournament of July 1980; Guinea v Libya twice (1981); Sudan's other matches at the Al-Jalaa tournament of 1970; Kuwait 2–0 Morocco (1973) and Kuwait 2–0 Libya (1974); Niger 1–0 Upper Volta (April 1965).
- Abandoned, the minute known from one record only: Guinea-Bissau 0–0 Senegal (14 June 1975, stopped after 77 minutes).
- Not checked yet, because Egypt's and the Asian sides' lists have not been read: Egypt's matches with Lebanon, Syria, Jordan, Iraq, Kuwait, Greece and Bulgaria; Egypt 2–1 Zimbabwe (the World Cup qualifier of 28 February 1993 that FIFA ordered replayed); Nigeria v Zimbabwe (Olympic qualifiers, October 1987); Angola 5–3 Gambia (July 1978; RSSSF's Gambia list has 3 July, Elo 4 July); United Arab Emirates 2–1 Mauritania (1997).

**The rest of Africa** (26 November 2026, evening; RSSSF's lists by Barrie Courtney for Zimbabwe, Angola, Madagascar, Mauritius, Réunion, Cape Verde, Somalia, Rwanda, Burundi, Namibia, Equatorial Guinea, Mozambique and Djibouti; RSSSF's overview of South Africa; RSSSF's note of Egypt's matches not counted as full internationals; for Egypt's other opponents, Wikipedia's results pages and RSSSF's tournament pages; about 155 open matches looked at). 14 added:

- Egypt 4–0 Lebanon (Pan Arab Games, Casablanca, 8 September 1961; Wikipedia's Lebanon results page agrees with Elo; RSSSF's Lebanon list has 29 August).
- Egypt 2–1 Zimbabwe (World Cup qualifier, Cairo, 28 February 1993): played, then annulled by FIFA after crowd trouble and replayed in Lyon on 15 April 1993 (0–0, already in the archive). Counted as played, with the annulment in its note.
- Zimbabwe 0–0 Nigeria and Nigeria 2–0 Zimbabwe (Olympic qualifiers, 4 and 17 October 1987).
- Burundi 6–2 Rwanda (Central African Games, Libreville, 1 July 1976).
- Seychelles 3–1 Mauritius (Indian Ocean tournament, 28 June 1976).
- Angola 5–3 Gambia (Cape Verde independence tournament, 4 July 1978; RSSSF's lists for both sides have 3 July).
- Angola 0–0 Madagascar and Madagascar 2–0 Zimbabwe (Mozambique independence tournament, 23 and 25 June 1981; RSSSF has 26 June for the second; Wikipedia's Angola page has the first as 1–1).
- Zimbabwe 1–1 Réunion (18 July 1982); Réunion 0–0 Mauritius (6 July 1983, at Réunion in both RSSSF lists); Réunion 2–0 Mauritius (20 December 2009).
- Malawi 1–0 Zimbabwe (Malawi independence tournament, 11 July 1992).
- Namibia 1–1 Eswatini (10 September 2014).

One archive date put right: Mauritius 2–0 Seychelles was played on 20 September 1978 in Réunion (archive 15 May 1978), RSSSF's Mauritius list and Elo agreeing.

Left out, with the reason:

- **England's FA tours of South Africa** (1910, 1920, 1929, 1939) and **Wales and England v South Africa** (1924): RSSSF's South Africa overview calls the touring side an English FA selection; matches against England's amateur and FA sides are out by rule.
- **Before independence**: Angola v Mozambique (14 matches, 1965–72; neither list has them); Southern Rhodesia v Northern Rhodesia (1931–62); Mauritius v Southern Rhodesia (October 1963, asterisked); Cape Verde v Guinea-Bissau (1960); Aden 4–2 Djibouti (1961); Madagascar 0–3 Kenya (1959).
- **The Indian Ocean tournaments of 1947, 1949, 1950 and 1963** (Madagascar, Mauritius, Réunion): RSSSF asterisks them in all three lists, except Madagascar 6–1 Réunion, which RSSSF dates 15 September 1963 and Elo 3 October 1959. The Mauritius v Réunion matches of 1932–33 are in no RSSSF list.
- **Egypt's matches with club, youth and military sides**, from RSSSF's own note: Kuwait Sport Club (14 November 1985), Saudi Arabia's youth team (9 July 1988); and, from RSSSF's appearance lists, Lokomotiv Moscow (21 July 1969) and Iraq's military team (9 November 1969). Egypt 1–1 East Germany (19 February 1964) was part of East Germany's Olympic build-up, which its own list does not count.
- RSSSF marks them as doubtful: Zambia 2–0 Zimbabwe (Blair Cup, 1988), Botswana 1–0 Zimbabwe (1988), Eswatini 4–4 Zimbabwe (1990), Cape Verde 1–0 Senegal (1990), Guinea-Bissau 0–1 Cape Verde (1995), Somalia 1–1 Sudan (1983), Angola 1–0 Ethiopia (2014), Equatorial Guinea 0–1 Togo (2013), Rwanda 2–1 Ivory Coast (CECAFA 2010), Syria 1–1 Egypt (July 1995; RSSSF has 0–0 on 9 July, not a full international), Egypt 1–1 Sudan (Arab Cup 2012).
- The records conflict: Greece v Egypt (Elo has 3–0 on 21 October and 2–2 on 28 November 1951; the other records have Egypt 0–2 Greece on 18 October and Greece 1–0 Egypt on 25 November 1951, and Greece 2–2 Egypt on 28 November 1952); Egypt 0–0 Bulgaria (14 January 1955; the others have 1–0 on 7 January); Lebanon 0–0 Egypt (Mediterranean Games 1963; Wikipedia has Egypt winning 2–0 on 26 September); Cape Verde 2–0 Guinea-Bissau (RSSSF 1 July 1978, Elo 4 July); United Arab Emirates 1–0 Egypt (Elo 31 January 1990; the archive and RSSSF have 27 January); Egypt 0–3 Hungary (Elo 21 February 1954; every other record has only the match of 12 February, already in the archive).
- Two Mozambique sides on one day: Zimbabwe 6–1 Mozambique (19 April 1981) was played the same day as Mozambique 3–3 Zaire, an African Cup of Nations qualifier in Maputo (RSSSF's Mozambique list), so the side in Zimbabwe was not Mozambique's first team.
- **Mauritius v Réunion, 1986**: Elo and RSSSF's lists have Mauritius 1–0 Réunion (13 July) and Réunion 0–0 Mauritius (20 July); the archive has Mauritius 0–1 Réunion (6 June) and Réunion 0–0 Mauritius (13 June). Probably the same two matches with wrong dates and one score reversed; held until a third record settles it.
- RSSSF does not list them: South Africa's friendlies with Lesotho (2007), Eswatini (2008, 2010), Mauritius (2009), Namibia (2009) and Zambia (2012); Zimbabwe's matches with Mozambique (21 June 1981) and Zambia (August 1995), Japan 0–0 Zimbabwe (2010); Tanzania 5–2 Somalia and Uganda 1–0 Somalia (January 1974), Tunisia 6–0 Somalia (1981); Burundi 3–2 Rwanda (1974); Réunion 0–1 Madagascar (1987); Madagascar's Francophone Games matches of 1989; Equatorial Guinea's friendlies with Liberia and Ivory Coast (February 2009) and São Tomé and Príncipe (2014); Nigeria 2–1 Egypt (1960).
- No day in one record or both: Gabon v Equatorial Guinea (1966, twice), São Tomé and Príncipe v Rwanda (June 1977, twice), Cape Verde 1–2 Guinea-Bissau (July 1980), Zambia 2–0 Madagascar (July 1967), Egypt 4–3 Kenya (1963), Egypt 3–0 Syria (Mediterranean Games 1955: Elo 25 July, Wikipedia's tournament dates end on 23 July), Northern Rhodesia v South Africa (1949, 1956).
- Not looked up yet: Jordan 1–6 Egypt (27 June 1969); Palestine 2–2 Egypt (7 April 1934); Seychelles' and São Tomé's other early matches.
- Out of the site's scope: Mayotte (not counted as a national team on the site).

### Rival pairs checked against outside lists (22 November 2026)

Each pair's matches were set beside RSSSF's list for the pair (or for each country), World Football Elo Ratings and, where its pages could be seen, 11v11. Formline counts a match only when both associations count it as a full international, and adds or changes nothing on one record's word alone.

No difference in which matches are held: Scotland v Wales (107), Scotland v Northern Ireland (96), Wales v Northern Ireland (97), Finland v Sweden (91), Argentina v Paraguay (107), Argentina v Chile (93) and Chile v Peru (88). RSSSF dates a few of these one day apart from the archive (Paraguay v Argentina 20 May 1919, 28 October 1923 and 12 October 1967; Chile v Peru 16 July 1975); the archive's dates stand until a second record is seen. RSSSF does not number Chile 0–2 Argentina of 21 September 1913 in its list for the pair, though its Chile list does; it stays.

Rows in the archive that only one association counts, or neither (left out by Formline):

| Date | Home | Score | Away | Venue | Why |
|---|---|---|---|---|---|
| 1950-06-25 | Denmark | 1–4 | Norway | Aarhus | official for Denmark only (RSSSF; 11v11 has it as unofficial for Norway) |
| 1957-07-12 | Denmark | 1–3 | Norway | Reykjavík | official for neither (RSSSF); Norway won 3–1 |
| 1981-02-28 | Norway | 2–4 | Sweden | Lahti (indoor) | official for Sweden only (RSSSF); 11v11 dates it 13 February |
| 2018-01-11 | Denmark | 0–1 | Sweden | Abu Dhabi | official for Sweden only: Denmark fielded its League XI (RSSSF) |
| 1983-09-03 | Malaysia | 0–0 | Singapore | Kuala Lumpur | Singapore's Olympic side (RSSSF, Santokh Singh's appearances) |
| 1983-09-10 | Singapore | 0–1 | Malaysia | Singapore | Singapore's Olympic side (same) |

Three rows of Formline's own hand-added list were taken out for the same reason: Sweden 1–0 Denmark (31 January 2000), Norway 4–2 Denmark (2 February 2000) and Finland 2–1 Denmark (4 February 2000), Nordic Championship matches at La Manga in which Denmark fielded its League XI. World Football Elo Ratings counts them; RSSSF marks them official for Denmark's opponents only.

Matches the archive lacks (added to `build/store/manual-men.csv`):

| Date | Home | Score | Away | Competition, venue | Records |
|---|---|---|---|---|---|
| 1970-09-13 | Norway | 2–4 | Sweden | Nordic Championship, Oslo | RSSSF (official match 81 of the series), Elo, 11v11 |
| 1983-05-19 | Denmark | 2–2 | Norway | Olympic qualifier, Aarhus | RSSSF (official match 75), Wikipedia (Norway's match 434), RSSSF Norway; Elo and 11v11 leave it out |
| 1983-08-17 | Norway | 1–1 | Denmark | Olympic qualifier, Oslo | RSSSF (official match 76), Wikipedia (Norway's match 439); Elo and 11v11 leave it out |
| 1971-08-20 | Malaysia | 4–2 | Singapore | Merdeka Tournament fifth-place match, Kuala Lumpur | RSSSF (tournament page and the pair's list), Wikipedia, 11v11 |
| 1978-05-05 | Malaysia | 3–2 | Singapore | King's Cup final, Bangkok | RSSSF (the pair's list), Elo, 11v11 |
| 1965-02-27 | Kenya | 3–0 | Uganda | African Cup of Nations qualifier | Elo; RSSSF's Kenya and Uganda lists (28 February) |
| 1965-03-13 | Uganda | 3–1 | Kenya | African Cup of Nations qualifier | Elo; RSSSF's Kenya and Uganda lists |
| 1972-10-08 | Uganda | 2–0 | Kenya | Friendly | same |
| 1981-07-25 | Kenya | 0–0 | Uganda | Friendly | same |
| 1986-12-12 | Kenya | 3–0 | Uganda | Jamhuri (independence day) match | same |
| 1991-06-27 | Uganda | 0–0 | Kenya | Friendly | same |
| 1996-05-05 | Kenya | 2–1 | Uganda | Friendly | same |
| 1996-05-07 | Kenya | 1–0 | Uganda | Friendly | same |

A wrong score and wrong dates:

- 1971-08-23 Singapore 2–4 Malaysia (Kallang): the match that day was 2–2 in the Pesta Sukan Cup, Malaysia winning 5–4 on penalties (RSSSF's list for the pair; 11v11). 2–4 is the Merdeka Tournament score of three days earlier, turned round. RSSSF's Pesta Sukan page says Malaysia may have used players who had not appeared in the Merdeka Tournament.
- 1971-10-30 Malaysia 1–1 Singapore (Saigon): played 31 October (RSSSF; 11v11).
- Kenya v Uganda, Gossage Cup: 1932-08-25 Uganda 13–1 Kenya was played 14 December 1932; 1938-10-10 Kenya 1–3 Uganda on 26 March 1938; 1939-11-28 Uganda 5–2 Kenya on 25 March 1939; 1944-11-07 Kenya 2–1 Uganda on 25 March 1944 (RSSSF and Elo agree on each). 1935-05-11 Kenya 1–3 Uganda is the 1936 match (Elo: 28 March 1936; RSSSF has it in 1936 without a day). 1966-11-30 Uganda 1–2 Kenya was played 8 October 1966, for Uganda's independence anniversary (Elo; RSSSF's Kenya list; RSSSF's Uganda list says 8 November).

Not settled, because the outside lists disagree with each other (nothing changed):

- **Malaysia v Singapore.** After the changes above the archive and RSSSF's list for the pair both have 81 matches from 1958 to 2024, Malaysia 32 wins, 27 draws, Singapore 22, but two matches differ: the archive has Singapore 3–1 Malaysia of 10 November 1982, which no RSSSF list has; RSSSF's list for the pair has Singapore 4–0 Malaysia of 26 August 1986 (Merlion Cup), which RSSSF's Malaysia list marks as probably a B or youth side and Elo leaves out. RSSSF has 0–0 for 18 August 1984 where the archive has 1–1, 14 December 1985 where the archive has the 15th, and 23 May 1989 where the archive and RSSSF's older lists have the 25th. Elo alone has friendlies on 29 September 1985 (1–1) and 6 October 1985 (Singapore 2–1), and five Sportsman's Trophy matches from 1949 to 1956.
- **Malaysia v Thailand** (105 in the archive with Formline's additions, the same matches as Elo). There is no list for the pair. RSSSF's Malaysia list (to 2000) has four the archive lacks: 3–3 in the President's Cup of May 1975, Thailand 1–0 in the King's Cup on 19 November 1980 (11v11 has it too), 0–0 in an Olympic qualifier in Singapore in April 1984, and two Olympic qualifiers of 1987 or 1988 (Thailand 1–0, then 2–2). Elo leaves out Thailand's Olympic qualifiers of 1984, though it has the other sides' from the same group. The archive has several that RSSSF's list lacks (27 October 1962, 31 October 1970, 15 May 1971, 29 August 1980), and RSSSF's Singapore list calls Malaysia's side at the 1972 King's Cup a B team. 11v11's own two pages for the pair give different totals (105 and 108).
- **Kenya v Uganda** (121 with Formline's additions: Uganda 0–0 Kenya of 4 April 1999 went in later the same day, once RSSSF's Uganda list was seen to have it). RSSSF's Kenya list has 120 it counts as full internationals. Still different: RSSSF has Uganda 0–0 Kenya of 1 September 1963, which Elo lacks; the archive has CECAFA Cup matches of 24 November 1981 (Kenya 3–1) and 27 November 1996 (Uganda 2–0) that RSSSF's lists lack; RSSSF has Kenya winning 3–2 on 28 September 1965 where the archive has 2–2; the two RSSSF lists both claim a 2–0 win for their own side on 2 December 1949. The Gossage Cup dates before 1946 that are not listed above rest on one record each.

### Both legs of a tie on the same date (10 pairs)

Home and away legs, in different cities, filed under one date, so one date in each pair is probably wrong. (The Argentina v Uruguay double-headers of 1916–29 are left out: those were real, with two teams playing in two cities on the same day.)

| Date | Home | Score | Away | Tournament | Venue | neutral |
|---|---|---|---|---|---|---|
| 1950-10-28 | Turkey | 3–1 | Egypt | Mediterranean Cup | Ankara, Turkey | FALSE |
| 1950-10-28 | Egypt | 3–0 | Turkey | Mediterranean Cup | Cairo, Egypt | FALSE |
| 1969-02-02 | Uganda | 2–1 | Cameroon | African Cup of Nations qualification | Kampala, Uganda | FALSE |
| 1969-02-02 | Cameroon | 2–0 | Uganda | African Cup of Nations qualification | Yaoundé, Cameroon | FALSE |
| 1969-06-29 | Zambia | 2–2 | Cameroon | African Cup of Nations qualification | Ndola, Zambia | FALSE |
| 1969-06-29 | Cameroon | 2–1 | Zambia | African Cup of Nations qualification | Yaoundé, Cameroon | FALSE |
| 1971-10-06 | Bermuda | 0–2 | Mexico | CONCACAF Championship qualification | Hamilton, Bermuda | FALSE |
| 1971-10-06 | Mexico | 4–0 | Bermuda | CONCACAF Championship qualification | Mexico City, Mexico | FALSE |
| 1973-04-08 | Ethiopia | 2–1 | Tanzania | African Cup of Nations qualification | Addis Ababa, Ethiopia | FALSE |
| 1973-04-08 | Tanzania | 3–0 | Ethiopia | African Cup of Nations qualification | Dar es Salaam, Tanzania | FALSE |
| 1973-06-05 | Zambia | 3–1 | Madagascar | African Cup of Nations qualification | Ndola, Zambia | FALSE |
| 1973-06-05 | Madagascar | 2–1 | Zambia | African Cup of Nations qualification | Antananarivo, Madagascar | FALSE |
| 1973-07-15 | Zambia | 5–1 | Nigeria | African Cup of Nations qualification | Lusaka, Zambia | FALSE |
| 1973-07-15 | Nigeria | 3–2 | Zambia | African Cup of Nations qualification | Lagos, Nigeria | FALSE |
| 1975-03-22 | Morocco | 4–0 | Senegal | African Cup of Nations qualification | Fez, Morocco | FALSE |
| 1975-03-22 | Senegal | 2–1 | Morocco | African Cup of Nations qualification | Kaolack, Senegal | FALSE |
| 1975-03-23 | Sudan | 1–0 | Kenya | African Cup of Nations qualification | Khartoum, Sudan | FALSE |
| 1975-03-23 | Kenya | 0–2 | Sudan | African Cup of Nations qualification | Nairobi, Kenya | FALSE |
| 1979-10-22 | Guadeloupe | 1–3 | Saint Vincent and the Grenadines | CFU Caribbean Cup qualification | Basse-Terre, Guadeloupe | FALSE |
| 1979-10-22 | Saint Vincent and the Grenadines | 0–0 | Guadeloupe | CFU Caribbean Cup qualification | Kingstown, Saint Vincent and the Grenadines | FALSE |

## Women's archive (martj42/womens-international-results)

### Wrong scores (found 13 to 18 November 2026 by checking against Wikipedia's results pages and API-Football)

The first three are in the archive as 0–0, and each was confirmed from the federation or a match report. The last eight are scores on which API-Football and Wikipedia agree against the archive.

| Date | Home | Archive | Away | Tournament | Should be | Sources |
|---|---|---|---|---|---|---|
| 2024-10-30 | United States | 0–0 | Argentina | Friendly | **3–0** (Louisville) | U.S. Soccer match report; both teams' Wikipedia pages |
| 2024-10-29 | Brazil | 0–0 | Colombia | Friendly | **3–1** (Cariacica) | ESPN; both teams' Wikipedia pages |
| 2018-03-26 | Australia | 0–0 | Thailand | Friendly | **5–0** (Perth) | Football Australia; both teams' Wikipedia pages |
| 2026-02-13 | China | 1–0 | Vietnam | Friendly | **6–1** (Shenzhen) | API-Football; both teams' Wikipedia pages |
| 2026-02-27 | Morocco | 3–0 | Burkina Faso | Friendly | **5–0** (Rabat) | API-Football; both teams' Wikipedia pages |
| 2024-10-23 | Venezuela | 0–2 | Thailand | Friendly | **2–0** (Mexico City; the score is the wrong way round) | API-Football; Thailand's Wikipedia page |
| 2024-02-16 | Panama | 0–2 | Paraguay | Friendly | **2–0** (the score is the wrong way round) | API-Football; both teams' Wikipedia pages |
| 2023-09-26 | Chile | 1–0 | New Zealand | Friendly | **2–1** | API-Football; both teams' Wikipedia pages |
| 2024-10-30 | Costa Rica | 0–0 | Panama | Friendly | **0–2** (Alajuela) | API-Football; both teams' Wikipedia pages |
| 2022-11-11 | France | 1–2 | Norway | Friendly | **2–1** (La Nucia; the score is the wrong way round) | API-Football; both teams' Wikipedia pages |
| 2021-10-25 | Trinidad and Tobago | 1–0 | Panama | Friendly | **1–1** | API-Football; both teams' Wikipedia pages |

A venue to look at: Cameroon 1–3 Nigeria (2026-03-03) is in the archive in Montpellier, France, as a neutral match; both teams' Wikipedia pages have it at the Stade Militaire in Yaoundé, three days after the first of the two matches there.

### Matches the archive does not hold (updated 19 November 2026)

551 women's matches the archive lacks are in [`build/store/manual-women.csv`](../build/store/manual-women.csv), in the archive's own columns with a source for each. The latest 309 were found from 14 to 19 November 2026 by setting API-Football's results for late August 2019 to October 2026 beside the archive, and each is also on Wikipedia (for 2023 and early 2024, often on the teams' pages as they stood a few weeks after the match, since few women's teams have results pages):

- **EAFF E-1 Championship 2025, all six matches of the final tournament** (9 to 16 July, Suwon and Hwaseong): Japan 4–0 Taiwan, South Korea 2–2 China, Taiwan 2–4 China, Japan 1–1 South Korea, Japan 0–0 China, South Korea 2–0 Taiwan. The archive holds the 2022 tournament and the 2023 qualifying.
- **Friendlies of 2025:** United Arab Emirates 3–1 Bangladesh twice (26 February and 2 March, Dubai), Lebanon 1–1 Comoros (5 April, Beirut; the archive has the 4–0 of 7 April), Senegal 0–1 Ghana (5 April, Thiès; the archive has the 1–0 of 8 April), Lebanon 2–1 Palestine (1 June, Jounieh), United Arab Emirates 2–2 Bahrain (2 June), Iran 8–0 and 7–0 Iraq (10 and 12 June, Tehran), Saudi Arabia 1–0 Bahrain (12 June, Taif), Morocco 1–0 Cape Verde (15 June, Salé), Morocco 4–2 Malawi (19 June, Kenitra), Ghana 3–1 Malawi (21 June, Benslimane), Uzbekistan 4–0 Palestine (24 June, Tashkent), Mali 1–1 Zambia (30 June, Mohammedia).
- **Abandoned:** Singapore v Hong Kong (15 June 2025, Choa Chu Kang), stopped by the weather with Hong Kong leading 1–0.
- **Friendlies of 2024:** Moldova 1–0 Saudi Arabia twice (7 August in the Czech Republic, 11 August in Austria), Mali 0–1 Botswana (30 November, Morocco).
- **Three more friendlies of 2020** (the last three rows of the file), each on both teams' pages of the time: Myanmar 1–2 and 1–1 Thailand (25 and 28 January, Mandalay) and Estonia 1–0 Latvia (12 August, Tallinn).
- **48 more friendlies, November 2020 to October 2021** (the 48 rows before those), each on both teams' pages of the time. Among them: Ghana 3–1 Morocco (26 November 2020, Accra), Ethiopia 11–0 and 3–0 South Sudan (April 2021, Addis Ababa), Belarus 6–0 Iran and Uzbekistan 5–0 Iran (June 2021, Belarus), Iceland 3–2 and 2–0 Republic of Ireland (June 2021), Jamaica 1–0 Nigeria and Portugal 3–3 Nigeria (June 2021, Houston), Nicaragua 1–0 Dominican Republic (7 July 2021, Panama City) and India's four matches in the UAE and Bahrain (October 2021). Malawi 17–0 Seychelles of 25 September 2023 is held back: the archive has a 17–0 three days later, and it may be the same match.
- **44 more friendlies, November 2021 to April 2022** (the 44 rows before those), each on both teams' pages of the time. Among them: Zambia 3–0 South Africa (11 February 2022), Romania 1–6 Austria and Switzerland 0–3 Austria (February 2022, Marbella), Greece 1–0 and 2–2 Israel, Colombia 2–2 and 0–0 Venezuela and Morocco 2–0 Ghana (April 2022), Colombia 1–0 Uruguay (30 November 2021; the archive has the 3–2 of 28 November), Philippines v Fiji and v Tonga twice each in Sydney (April 2022).
- **68 more friendlies, May 2022 to October 2024** (the 68 rows before those), each on both teams' pages as they stood about ten weeks after the match. Among them: Poland 1–3 Iceland and Portugal 4–0 Greece (June 2022), Czech Republic 3–3 Hungary, Poland 4–0 Morocco and Belarus 0–2 and 2–2 Russia (October 2022), Portugal 5–0 Haiti, Serbia 1–0 and 0–1 Russia, Colombia 1–0 Zambia and Jamaica 1–0 and 1–2 Paraguay (November 2022), Luxembourg 5–5 and 2–1 Faroe Islands (April 2023).
- **89 friendlies from December 2022 to July 2024**, the largest gap found so far; the rows are the 89 before those. Among them: Czech Republic 3–0 Slovakia, Slovenia 0–3 Serbia, Portugal 2–0 Ukraine, Hungary 1–0 Greece, Russia 2–0 Iran (18 July; the 4–0 of 14 July is left out, Iran's record calling it unofficial), Georgia 5–0 and 3–1 Armenia (all July 2023), Morocco 0–1 Jamaica (16 July 2023, Melbourne), Czech Republic 2–0 Morocco (6 April 2023), France 5–0 Uzbekistan (5 July 2024), Paraguay 0–3 and 1–1 Russia (30 November and 3 December 2023).
- **Central American and Caribbean Games 2026, all 16 matches** (29 July to 6 August, Moca and Santiago de los Caballeros; senior national teams). Final: Colombia 1–1 Mexico, Mexico 4–2 on penalties. Semi-finals: Venezuela 2–2 Colombia (Colombia 4–3 on penalties) and Mexico 4–1 El Salvador after extra time. The archive holds the 2010, 2014, 2018 and 2023 tournaments.
- **Friendlies, the first of two matches where the archive has only the second:** Hong Kong 3–2 Malaysia (2025-10-22, Tseung Kwan O, behind closed doors), Uzbekistan 1–0 Iran (2025-12-02, Tashkent; the archive has the 2–0 of 29 November), Cameroon 1–0 Nigeria (2026-02-28, Yaoundé), Egypt 0–3 Algeria (2026-02-28, Cairo), Nigeria 2–1 Senegal (2026-06-05, Ikenne), Egypt 1–1 Tunisia (2026-06-05, Cairo; Egypt 4–2 on penalties), Morocco 4–2 Benin (2026-06-05, Rabat).
- **Other friendlies:** Djibouti 4–1 Somalia (2025-10-24, Djibouti City), Eswatini 1–1 Lesotho (2025-11-22, Lobamba; Eswatini's page has 23 November), Tonga 4–1 Tahiti (2025-12-01, Avarua, Cook Islands), Fiji 2–1 American Samoa (2026-02-21, Ba), Kenya 0–2 Benin (2026-03-02, Abidjan), United Arab Emirates 0–0 Tajikistan (2026-03-05, Dubai), Morocco 3–0 Cape Verde (2026-03-07, Rabat), Nigeria 2–1 Tanzania (2026-07-22, Casablanca).
- Cook Islands 1–0 and 3–0 Afghanistan (4 and 8 June 2026, Auckland). Afghanistan here is Afghan Women United, the side the archive lists as Afghanistan in the FIFA Unites Women's Series of 2025.

### Flagged neutral, but the venue is in the away side's country (6 rows)

Some of these may be the listed home side's designated home match played in the opponent's country (Haiti and Ukraine played home matches abroad in 2023). If so, the rows follow the archive's convention, but the neutral flag hides that the away side was playing at home. Worth a look in case any are a wrong venue or a home/away swap instead.

| Date | Home | Score | Away | Tournament | Venue | neutral |
|---|---|---|---|---|---|---|
| 2015-04-06 | Georgia | 1–2 | Malta | UEFA Euro qualification | Hamrun, Malta | TRUE |
| 2023-10-29 | Guyana | 1–0 | Suriname | CONCACAF Gold Cup qualification | Paramaribo, Suriname | TRUE |
| 2023-10-30 | Haiti | 13–0 | Saint Kitts and Nevis | CONCACAF Gold Cup qualification | Basseterre, Saint Kitts and Nevis | TRUE |
| 2023-10-31 | Ukraine | 1–0 | Greece | UEFA Nations League | Heraklion, Greece | TRUE |
| 2023-12-01 | Ukraine | 0–1 | Poland | UEFA Nations League | Stalowa Wola, Poland | TRUE |
| 2023-12-05 | Mexico | 1–0 | Trinidad and Tobago | CONCACAF Gold Cup qualification | Port of Spain, Trinidad and Tobago | TRUE |

### Not flagged neutral, but played outside the home side's country (5 rows)

| Date | Home | Score | Away | Tournament | Venue | neutral |
|---|---|---|---|---|---|---|
| 2013-04-04 | Faroe Islands | 3–3 | Montenegro | FIFA World Cup qualification | Vilnius, Lithuania | FALSE |
| 2013-04-09 | Faroe Islands | 2–1 | Georgia | FIFA World Cup qualification | Vilnius, Lithuania | FALSE |
| 2026-06-05 | New Zealand | 1–2 | Haiti | Friendly | Antequera, Spain | FALSE |
| 2026-06-08 | Equatorial Guinea | 1–3 | Haiti | Friendly | Antequera, Spain | FALSE |
| 2026-06-09 | New Zealand | 0–0 | Morocco | Friendly | Antequera, Spain | FALSE |

### Venue country

| Date | Home | Score | Away | Tournament | Venue | neutral |
|---|---|---|---|---|---|---|
| 2026-06-08 | Nigeria | 3–0 | Senegal | Friendly | Ikenne, Senegal | FALSE | Ikenne is in Nigeria, not Senegal

### One team or competition under two spellings

| Used | Also used | |
|---|---|---|
| United States Virgin Islands (24 matches) | U.S. Virgin Islands (10) | team |
| Turks and Caicos Islands (15 matches) | Turks and Caicos (3) | team |
| Shetland (5 matches) | Shetland Islands (4) | team |
| UEFA Nations League (318) | UEFA Women's Nations League (20) | tournament |
| WAFF Championship (79) | WAFF Women's Championship (10) | tournament |
| CONCACAF Olympic Qualifying Tournament (55) | Olympic qualifyication (2) | tournament |

"Olympic qualifyication" is a misspelling; those two matches are the 2023 CONCACAF Olympic play-off (Jamaica v Canada).

### Former names

The women's archive has no `former_names.csv`, and files some teams under period names (Serbia and Montenegro, Macedonia, Netherlands Antilles, FR Yugoslavia) while filing others under current names (Russia for the 1991–92 USSR/CIS matches). A former-names file like the men's would make both readable the same way.

