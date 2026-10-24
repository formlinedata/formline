# Possible errors in the martj42 archives

Found by the Formline data check against the archives as of 6 Oct 2026 (men) and 13 Oct 2026 (women). Each section is written so it can be pasted into a GitHub issue on the relevant repository. Formline corrects these on its own side in the meantime (`CORRECTIONS` and `venueSide` in `index.html`).

## Men's archive (martj42/international_results)

### Home side flagged neutral when the venue is in its own country under a former name (45 rows)

The `country` column uses the period name (Soviet Union, United Arab Republic, Malaya, Irish Free State, Dahomey, Upper Volta) while `home_team` uses the current name, so the neutral flag seems to have been set by comparing the two. These were home matches.

| Date | Home | Score | Away | Tournament | Venue | neutral |
|---|---|---|---|---|---|---|
| 1934-02-25 | Republic of Ireland | 4–4 | Belgium | FIFA World Cup qualification | Dublin, Irish Free State | TRUE |
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

### Not flagged neutral, but played outside the home side's country (1 rows)

| Date | Home | Score | Away | Tournament | Venue | neutral |
|---|---|---|---|---|---|---|
| 2019-10-12 | Ivory Coast | 3–1 | DR Congo | Friendly | Amiens, France | TRUE |

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

### Flagged neutral, but the venue is in the away side's country (6 rows)

Either the away side was at home (and the flag should be FALSE with the teams swapped), or the venue is wrong.

| Date | Home | Score | Away | Tournament | Venue | neutral |
|---|---|---|---|---|---|---|
| 2015-04-06 | Georgia | 1–2 | Malta | UEFA Euro qualification | Hamrun, Malta | TRUE |
| 2023-10-29 | Guyana | 1–0 | Suriname | CONCACAF Gold Cup qualification | Paramaribo, Suriname | TRUE |
| 2023-10-30 | Haiti | 13–0 | Saint Kitts and Nevis | CONCACAF Gold Cup qualification | Basseterre, Saint Kitts and Nevis | TRUE |
| 2023-10-31 | Ukraine | 1–0 | Greece | UEFA Nations League | Heraklion, Greece | TRUE |
| 2023-12-01 | Ukraine | 0–1 | Poland | UEFA Nations League | Stalowa Wola, Poland | TRUE |
| 2023-12-05 | Mexico | 1–0 | Trinidad and Tobago | CONCACAF Gold Cup qualification | Port of Spain, Trinidad and Tobago | TRUE |

### Not flagged neutral, but played outside the home side's country (6 rows)

| Date | Home | Score | Away | Tournament | Venue | neutral |
|---|---|---|---|---|---|---|
| 2013-04-04 | Faroe Islands | 3–3 | Montenegro | FIFA World Cup qualification | Vilnius, Lithuania | FALSE |
| 2013-04-09 | Faroe Islands | 2–1 | Georgia | FIFA World Cup qualification | Vilnius, Lithuania | FALSE |
| 2026-06-05 | New Zealand | 1–2 | Haiti | Friendly | Antequera, Spain | FALSE |
| 2026-06-07 | Saudi Arabia | 4–0 | Sri Lanka | Friendly | Bangkok, Thailand | TRUE |
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
| African Cup of Nations qualification (0) | Africa Cup of Nations qualification (170) | tournament |
| UEFA Nations League (318) | UEFA Women's Nations League (20) | tournament |
| WAFF Championship (79) | WAFF Women's Championship (10) | tournament |
| CONCACAF Olympic Qualifying Tournament (55) | Olympic qualifyication (2) | tournament |

"Olympic qualifyication" is a misspelling; those two matches are the 2023 CONCACAF Olympic play-off (Jamaica v Canada).

### Former names

The women's archive has no `former_names.csv`, and files some teams under period names (Serbia and Montenegro, Macedonia, Netherlands Antilles, FR Yugoslavia) while filing others under current names (Russia for the 1991–92 USSR/CIS matches). A former-names file like the men's would make both readable the same way.

