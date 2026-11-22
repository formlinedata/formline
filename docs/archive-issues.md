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

World Football Elo Ratings lists about 4,650 men's matches that are not in the archive. **2,256 of them have been confirmed in a second record**, and 30 more matches came from API-Football with a second record (World Football Elo Ratings or Wikipedia), (a Wikipedia page of one or both teams, or the competition's own page; a few from RSSSF or a federation's report) and are listed, in the archive's own columns plus a source for each, in [`build/store/manual-men.csv`](../build/store/manual-men.csv) in this repository (2,289 rows; one is Argentina v Uruguay of 28 September 1924, abandoned within minutes at 0–0 and played again on 2 October, which RSSSF counts as official match 81 of the series; two of them are Kuwait's 2018 World Cup qualifiers of 24 and 29 March 2016, awarded 3–0 against it without being played, which the archive lacks though it has the Myanmar v Kuwait one of 17 November 2015). 404 were played since November 2014. They are free to take.

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

