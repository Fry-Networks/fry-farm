# V1 Pool On-Chain Investigation Report

Generated: 2026-03-17T00:52:12.965Z

## Summary

| Metric | Value |
|--------|-------|
| Total pools checked | 11 |
| Total active stakers | 61 |
| Users owed delta | 61 |
| Total correct reward | 559159.619036 tokens |
| Total V1 would pay | 356303.123936 tokens |
| Total delta owed | 202830.137415 tokens |

## APR Discrepancies: On-Chain vs MongoDB

| App ID | Pool | On-Chain APR | MongoDB APR | Match? |
|--------|------|-------------|------------|--------|
| 3465579498 | Fry -> Fry | 7165 (71.65%) | 5095 (50.95%) | MISMATCH |
| 3468848937 | USD Coin -> Fry | 30707144 (307071.44%) | 6525483 (65254.83%) | MISMATCH |
| 3469720617 | Fry -> Fry | 47162 (471.62%) | 49412 (494.12%) | MISMATCH |
| 3470020844 | Fry -> Fry | 3099 (30.99%) | 1594 (15.94%) | MISMATCH |
| 3473560676 | Fry Node -> Fry Node | 6340 (63.40%) | 10000 (100%) | MISMATCH |
| 3473562061 | Fry VPN -> Fry VPN | 7875303 (78753.03%) | 10000 (100%) | MISMATCH |
| 3473563847 | Fry -> Fry | 676254 (6762.54%) | 5000 (50%) | MISMATCH |
| 3473565258 | Fry Node -> Fry Node | 0 (0.00%) | 5000 (50%) | MISMATCH |
| 3473566323 | Fry VPN -> Fry VPN | 0 (0.00%) | 5000 (50%) | MISMATCH |
| 3473573376 | Fry -> Fry | 39230 (392.30%) | 2500 (25%) | MISMATCH |
| 3473574550 | Fry Node -> Fry Node | 3465 (34.65%) | 2500 (25%) | MISMATCH |

## Pool Reward Token Balances

| App ID | Pool | Reward Token | Balance | V1 Would Pay | Can Cover? |
|--------|------|-------------|---------|-------------|------------|
| 3465579498 | Fry -> Fry | 2485314946 | 20200.049 | 429.900 | YES |
| 3468848937 | USD Coin -> Fry | 2485314946 | 4138.066 | 2347.423 | YES |
| 3469720617 | Fry -> Fry | 2485314946 | 19270053.210 | 171842.441 | YES |
| 3470020844 | Fry -> Fry | 2485314946 | 389483.247 | 1836.690 | YES |
| 3473560676 | Fry Node -> Fry Node | 2485202024 | 17935318.828 | 69185.992 | YES |
| 3473562061 | Fry VPN -> Fry VPN | 2485198745 | 127555.399 | 1256.497 | YES |
| 3473563847 | Fry -> Fry | 2485314946 | 6311985.854 | 61360.200 | YES |
| 3473565258 | Fry Node -> Fry Node | 2485202024 | 3514402.980 | 0.000 | YES |
| 3473566323 | Fry VPN -> Fry VPN | 2485198745 | 63694.580 | 0.000 | YES |
| 3473573376 | Fry -> Fry | 2485314946 | 3896693.904 | 30711.499 | YES |
| 3473574550 | Fry Node -> Fry Node | 2485202024 | 6759661.493 | 17332.481 | YES |

## On-Chain Global State (All V1 Pools)

### Pool 3465579498 — Fry -> Fry

| Key | Value |
|-----|-------|
| apr | 7165 (71.65%) |
| authority | E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE |
| created_At | 1772494595 |
| lock_period | 259200 |
| pool_time | 432000 |
| reward_token | 2485314946 |
| reward_token_amount | 199048784 |
| rewards_distributed | 0 |
| stake_end_time | 1772863200 |
| stake_start_time | 1772431200 |
| stake_token | 2485314946 |
| total_staked | 20000000000 |
| total_stakers | 8 |

### Pool 3468848937 — USD Coin -> Fry

| Key | Value |
|-----|-------|
| apr | 30707144 (307071.44%) |
| authority | XETLSDPESZHWVAVWWQLZPS5T65UBBIRVGRN4SMRNWSYBFH5BPPLGUWPF4Q |
| created_At | 1772790436 |
| lock_period | 259200 |
| pool_time | 604800 |
| reward_token | 2485314946 |
| reward_token_amount | 4137066438 |
| rewards_distributed | 0 |
| stake_end_time | 1773442800 |
| stake_start_time | 1772838000 |
| stake_token | 31566704 |
| total_staked | 69145516 |
| total_stakers | 14 |

### Pool 3469720617 — Fry -> Fry

| Key | Value |
|-----|-------|
| apr | 47162 (471.62%) |
| authority | E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE |
| created_At | 1772871552 |
| lock_period | 15552000 |
| pool_time | 31536000 |
| reward_token | 2485314946 |
| reward_token_amount | 15937199060000 |
| rewards_distributed | 0 |
| stake_end_time | 1804399200 |
| stake_start_time | 1772863200 |
| stake_token | 2485314946 |
| total_staked | 3332853149747 |
| total_stakers | 29 |

### Pool 3470020844 — Fry -> Fry

| Key | Value |
|-----|-------|
| apr | 3099 (30.99%) |
| authority | O7IVZIWKKCJYUHK76RUZWZETQWKNFYHKLWYKJKCBGEQTAYCZQAEGPQZXYM |
| created_At | 1772902113 |
| lock_period | 1209600 |
| pool_time | 1209600 |
| reward_token | 2485314946 |
| reward_token_amount | 4638411400 |
| rewards_distributed | 0 |
| stake_end_time | 1774047600 |
| stake_start_time | 1772838000 |
| stake_token | 2485314946 |
| total_staked | 384843835588 |
| total_stakers | 12 |

### Pool 3473560676 — Fry Node -> Fry Node

| Key | Value |
|-----|-------|
| apr | 6340 (63.40%) |
| authority | E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE |
| created_At | 1773202328 |
| lock_period | 15552000 |
| pool_time | 31536000 |
| reward_token | 2485202024 |
| reward_token_amount | 7022700760000 |
| rewards_distributed | 0 |
| stake_end_time | 1804654800 |
| stake_start_time | 1773118800 |
| stake_token | 2485202024 |
| total_staked | 10912617067522 |
| total_stakers | 14 |

### Pool 3473562061 — Fry VPN -> Fry VPN

| Key | Value |
|-----|-------|
| apr | 7875303 (78753.03%) |
| authority | E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE |
| created_At | 1773202435 |
| lock_period | 15552000 |
| pool_time | 31536000 |
| reward_token | 2485198745 |
| reward_token_amount | 127394850000 |
| rewards_distributed | 0 |
| stake_end_time | 1804654800 |
| stake_start_time | 1773118800 |
| stake_token | 2485198745 |
| total_staked | 159549052 |
| total_stakers | 2 |

### Pool 3473563847 — Fry -> Fry

| Key | Value |
|-----|-------|
| apr | 676254 (6762.54%) |
| authority | E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE |
| created_At | 1773202580 |
| lock_period | 5184000 |
| pool_time | 31536000 |
| reward_token | 2485314946 |
| reward_token_amount | 6221249420000 |
| rewards_distributed | 0 |
| stake_end_time | 1804654800 |
| stake_start_time | 1773118800 |
| stake_token | 2485314946 |
| total_staked | 90735433748 |
| total_stakers | 3 |

### Pool 3473565258 — Fry Node -> Fry Node

| Key | Value |
|-----|-------|
| apr | 0 (0.00%) |
| authority | E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE |
| created_At | 1773202695 |
| lock_period | 5184000 |
| pool_time | 31536000 |
| reward_token | 2485202024 |
| reward_token_amount | 3514401980000 |
| rewards_distributed | 0 |
| stake_end_time | 1804654800 |
| stake_start_time | 1773118800 |
| stake_token | 2485202024 |
| total_staked | 0 |
| total_stakers | 1 |

### Pool 3473566323 — Fry VPN -> Fry VPN

| Key | Value |
|-----|-------|
| apr | 0 (0.00%) |
| authority | E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE |
| created_At | 1773202764 |
| lock_period | 5184000 |
| pool_time | 31536000 |
| reward_token | 2485198745 |
| reward_token_amount | 63693580000 |
| rewards_distributed | 0 |
| stake_end_time | 1804654800 |
| stake_start_time | 1773118800 |
| stake_token | 2485198745 |
| total_staked | 0 |
| total_stakers | 0 |

### Pool 3473573376 — Fry -> Fry

| Key | Value |
|-----|-------|
| apr | 39230 (392.30%) |
| authority | E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE |
| created_At | 1773202974 |
| lock_period | 2592000 |
| pool_time | 31536000 |
| reward_token | 2485314946 |
| reward_token_amount | 3113835420000 |
| rewards_distributed | 0 |
| stake_end_time | 1804654800 |
| stake_start_time | 1773118800 |
| stake_token | 2485314946 |
| total_staked | 782857483595 |
| total_stakers | 1 |

### Pool 3473574550 — Fry Node -> Fry Node

| Key | Value |
|-----|-------|
| apr | 3465 (34.65%) |
| authority | E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE |
| created_At | 1773203062 |
| lock_period | 2592000 |
| pool_time | 31536000 |
| reward_token | 2485202024 |
| reward_token_amount | 1757501600000 |
| rewards_distributed | 0 |
| stake_end_time | 1804654800 |
| stake_start_time | 1773118800 |
| stake_token | 2485202024 |
| total_staked | 5002158892793 |
| total_stakers | 2 |

## Per-Pool Corrected Audit

### Pool 3465579498 — Fry -> Fry

- On-chain APR: 7165 (71.65%)
- MongoDB APR: 50.95% **MISMATCH**
- Active stakers: 1
- Users owed delta: 1
- Total correct reward: 483.315461 tokens
- Total V1 would pay: 429.900000 tokens
- Total delta owed: 53.415461 tokens

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| HD4TS4HQ... | 20000.000 | 12.1 | 483.315 | 429.900 | 0.000 | 0.000 | 53.415 |

### Pool 3468848937 — USD Coin -> Fry

- On-chain APR: 30707144 (307071.44%)
- MongoDB APR: 65254.83% **MISMATCH**
- Active stakers: 5
- Users owed delta: 5
- Total correct reward: 3754.461398 tokens
- Total V1 would pay: 2347.423466 tokens
- Total delta owed: 1399.142074 tokens

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| CKMHAQKU... | 7.000 | 9.2 | 548.214 | 429.900 | 0.000 | 0.000 | 118.314 |
| D7F47755... | 20.000 | 4.2 | 715.057 | 614.143 | 0.000 | 7.896 | 93.018 |
| FGCOER2A... | 41.746 | 6.9 | 2468.508 | 1281.901 | 0.000 | 0.000 | 1186.607 |
| S7OSRZCJ... | 0.100 | 3.8 | 3.196 | 3.055 | 0.000 | 0.000 | 0.140 |
| 3MCHLCXE... | 0.300 | 7.6 | 19.486 | 18.424 | 0.000 | 0.000 | 1.062 |

### Pool 3469720617 — Fry -> Fry

- On-chain APR: 47162 (471.62%)
- MongoDB APR: 494.12% **MISMATCH**
- Active stakers: 25
- Users owed delta: 25
- Total correct reward: 293461.405217 tokens
- Total V1 would pay: 171842.441462 tokens
- Total delta owed: 121600.501928 tokens

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| AHR3OGEL... | 79.060 | 4.4 | 4.565 | 3.729 | 0.000 | 0.000 | 0.837 |
| C7QJMEPT... | 582.110 | 5.2 | 39.358 | 27.453 | 0.000 | 0.000 | 11.905 |
| FGCOER2A... | 150000.000 | 6.9 | 13619.347 | 7074.300 | 0.000 | 0.000 | 6545.047 |
| FKULJE4P... | 100.000 | 4.4 | 5.749 | 4.716 | 0.000 | 0.000 | 1.033 |
| GZFBBGT5... | 10.000 | 9.6 | 1.255 | 0.943 | 0.000 | 0.000 | 0.312 |
| HD4TS4HQ... | 62328.155 | 3.9 | 3221.319 | 2939.520 | 0.000 | 0.000 | 281.799 |
| HQK4C6ZT... | 100510.000 | 7.5 | 9887.292 | 9480.505 | 0.000 | 0.000 | 406.786 |
| IVZBBARA... | 1900.000 | 4.2 | 105.480 | 89.608 | 0.000 | 0.000 | 15.872 |
| JOSSUIJF... | 908.454 | 4.6 | 54.191 | 42.845 | 0.000 | 0.000 | 11.347 |
| K6YAELU4... | 103598.062 | 4.4 | 5989.569 | 4885.892 | 0.000 | 18.462 | 1085.215 |
| NLWZTXWG... | 754.943 | 5.4 | 53.699 | 35.605 | 0.000 | 0.000 | 18.094 |
| O7IVZIWK... | 510100.000 | 6.5 | 43114.870 | 24057.336 | 0.000 | 0.000 | 19057.534 |
| P744HKOJ... | 127.435 | 5.4 | 9.092 | 6.010 | 0.000 | 0.000 | 3.082 |
| QMF244XQ... | 16946.550 | 3.7 | 829.428 | 799.233 | 0.000 | 0.000 | 30.195 |
| RAFYQLYP... | 3823.657 | 3.7 | 183.991 | 180.331 | 0.000 | 0.000 | 3.660 |
| RETW2VNG... | 54.725 | 4 | 2.865 | 2.581 | 0.000 | 0.000 | 0.284 |
| SAF4L4OS... | 110000.000 | 7.5 | 10814.847 | 10375.640 | 0.000 | 0.000 | 439.207 |
| S7OSRZCJ... | 110.000 | 6.3 | 9.118 | 5.188 | 0.000 | 0.000 | 3.930 |
| S7UK3J65... | 200.000 | 4.3 | 11.153 | 9.432 | 0.000 | 0.000 | 1.721 |
| WFOELFUQ... | 290.000 | 9.5 | 35.947 | 27.354 | 0.000 | 0.000 | 8.593 |
| XETLSDPE... | 100000.000 | 7.5 | 9824.674 | 9432.400 | 0.000 | 0.000 | 392.274 |
| ZS5OGNCK... | 10000.000 | 7.2 | 938.656 | 471.620 | 0.000 | 0.000 | 467.036 |
| 3KSLWW7K... | 2130000.000 | 6.9 | 191947.193 | 100455.060 | 0.000 | 0.000 | 91492.133 |
| 42TRM7VU... | 330.000 | 4.2 | 18.335 | 15.563 | 0.000 | 0.000 | 2.772 |
| 6UG2TUJV... | 30100.000 | 6.9 | 2739.411 | 1419.576 | 0.000 | 0.000 | 1319.835 |

### Pool 3470020844 — Fry -> Fry

- On-chain APR: 3099 (30.99%)
- MongoDB APR: 15.94% **MISMATCH**
- Active stakers: 12
- Users owed delta: 12
- Total correct reward: 2252.798250 tokens
- Total V1 would pay: 1836.690018 tokens
- Total delta owed: 416.108232 tokens

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| C3OBUOZO... | 99.762 | 4 | 0.342 | 0.309 | 0.000 | 0.000 | 0.033 |
| C7QJMEPT... | 2000.000 | 5.2 | 8.894 | 6.198 | 0.000 | 0.000 | 2.696 |
| D7F47755... | 75000.000 | 7.3 | 468.754 | 464.850 | 0.000 | 0.000 | 3.904 |
| FGCOER2A... | 20000.000 | 8.4 | 144.070 | 123.960 | 0.000 | 0.000 | 20.110 |
| FKULJE4P... | 200.000 | 4.1 | 0.697 | 0.620 | 0.000 | 0.000 | 0.078 |
| K6YAELU4... | 92316.074 | 5.7 | 455.493 | 286.088 | 0.000 | 0.000 | 169.405 |
| O7IVZIWK... | 6000.000 | 7.6 | 39.180 | 37.188 | 0.000 | 0.000 | 1.992 |
| TXDBUB2E... | 1000.000 | 4.9 | 4.190 | 3.099 | 0.000 | 0.000 | 1.091 |
| WFOELFUQ... | 53.000 | 8.4 | 0.384 | 0.328 | 0.000 | 0.000 | 0.055 |
| XETLSDPE... | 106775.000 | 7.5 | 691.922 | 661.791 | 0.000 | 0.000 | 30.131 |
| 3MCHLCXE... | 71300.000 | 6.2 | 378.464 | 220.959 | 0.000 | 0.000 | 157.505 |
| 6UG2TUJV... | 10100.000 | 6.9 | 60.408 | 31.300 | 0.000 | 0.000 | 29.108 |

### Pool 3473560676 — Fry Node -> Fry Node

- On-chain APR: 6340 (63.40%)
- MongoDB APR: 100% **MISMATCH**
- Active stakers: 11
- Users owed delta: 11
- Total correct reward: 93838.825804 tokens
- Total V1 would pay: 69185.992206 tokens
- Total delta owed: 24652.833598 tokens

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| C7QJMEPT... | 27361.433 | 5.2 | 248.819 | 173.471 | 0.000 | 0.000 | 75.347 |
| FKULJE4P... | 1000.000 | 4.4 | 7.727 | 6.340 | 0.000 | 0.000 | 1.387 |
| HD4TS4HQ... | 1640082.007 | 3.9 | 11392.768 | 10398.120 | 0.000 | 0.000 | 994.648 |
| JOSSUIJF... | 46347.940 | 4.6 | 371.607 | 293.846 | 0.000 | 0.000 | 77.761 |
| K6YAELU4... | 63391.047 | 5.7 | 639.474 | 401.899 | 0.000 | 0.000 | 237.575 |
| MVDHJTPI... | 1700000.000 | 5.8 | 17425.785 | 10778.000 | 0.000 | 0.000 | 6647.785 |
| RETW2VNG... | 248750.000 | 4 | 1745.800 | 1577.075 | 0.000 | 0.000 | 168.725 |
| UV5CWWZC... | 21184.640 | 4.9 | 181.562 | 134.311 | 0.000 | 0.000 | 47.251 |
| 3KSLWW7K... | 7000000.000 | 4.9 | 60624.701 | 44380.000 | 0.000 | 0.000 | 16244.701 |
| 42TRM7VU... | 65000.000 | 4.2 | 485.589 | 412.100 | 0.000 | 0.000 | 73.489 |
| 6UG2TUJV... | 99500.000 | 4.1 | 714.995 | 630.830 | 0.000 | 0.000 | 84.165 |

### Pool 3473562061 — Fry VPN -> Fry VPN

- On-chain APR: 7875303 (78753.03%)
- MongoDB APR: 100% **MISMATCH**
- Active stakers: 2
- Users owed delta: 2
- Total correct reward: 1792.142144 tokens
- Total V1 would pay: 1256.497127 tokens
- Total delta owed: 535.645017 tokens

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| HD4TS4HQ... | 53.047 | 3.9 | 457.663 | 417.761 | 0.000 | 0.000 | 39.902 |
| K6YAELU4... | 106.502 | 5.7 | 1334.479 | 838.736 | 0.000 | 0.000 | 495.743 |

### Pool 3473563847 — Fry -> Fry

- On-chain APR: 676254 (6762.54%)
- MongoDB APR: 50% **MISMATCH**
- Active stakers: 2
- Users owed delta: 2
- Total correct reward: 97565.625460 tokens
- Total V1 would pay: 61360.200013 tokens
- Total delta owed: 36205.425447 tokens

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| HD4TS4HQ... | 310.090 | 3.9 | 229.694 | 209.700 | 0.000 | 0.000 | 19.994 |
| K6YAELU4... | 90425.343 | 5.7 | 97335.931 | 61150.500 | 0.000 | 0.000 | 36185.431 |

### Pool 3473565258 — Fry Node -> Fry Node

- On-chain APR: 0 (0.00%)
- MongoDB APR: 50% **MISMATCH**
- Active stakers: 0
- Users owed delta: 0
- Total correct reward: 0.000000 tokens
- Total V1 would pay: 0.000000 tokens
- Total delta owed: 0.000000 tokens

*No active stakers.*

### Pool 3473566323 — Fry VPN -> Fry VPN

- On-chain APR: 0 (0.00%)
- MongoDB APR: 50% **MISMATCH**
- Active stakers: 0
- Users owed delta: 0
- Total correct reward: 0.000000 tokens
- Total V1 would pay: 0.000000 tokens
- Total delta owed: 0.000000 tokens

*No active stakers.*

### Pool 3473573376 — Fry -> Fry

- On-chain APR: 39230 (392.30%)
- MongoDB APR: 25% **MISMATCH**
- Active stakers: 1
- Users owed delta: 1
- Total correct reward: 42202.540592 tokens
- Total V1 would pay: 30711.499081 tokens
- Total delta owed: 11491.041511 tokens

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| FMVQGM4D... | 782857.484 | 4.9 | 42202.541 | 30711.499 | 0.000 | 0.000 | 11491.042 |

### Pool 3473574550 — Fry Node -> Fry Node

- On-chain APR: 3465 (34.65%)
- MongoDB APR: 25% **MISMATCH**
- Active stakers: 2
- Users owed delta: 2
- Total correct reward: 23808.504710 tokens
- Total V1 would pay: 17332.480563 tokens
- Total delta owed: 6476.024147 tokens

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| FMVQGM4D... | 4922158.893 | 4.9 | 23433.848 | 17055.281 | 0.000 | 0.000 | 6378.567 |
| TXDBUB2E... | 80000.000 | 4.9 | 374.657 | 277.200 | 0.000 | 0.000 | 97.457 |

## Top 10 Largest Deltas Owed

| Wallet | Pool | Delta Owed |
|--------|------|-----------|
| 3KSLWW7KIUGI... | 3469720617 (Fry -> Fry) | 91492.132964 tokens |
| K6YAELU4EETZ... | 3473563847 (Fry -> Fry) | 36185.431017 tokens |
| O7IVZIWKKCJY... | 3469720617 (Fry -> Fry) | 19057.534296 tokens |
| 3KSLWW7KIUGI... | 3473560676 (Fry Node -> Fry Node) | 16244.700874 tokens |
| FMVQGM4DCVL2... | 3473573376 (Fry -> Fry) | 11491.041511 tokens |
| MVDHJTPITMSI... | 3473560676 (Fry Node -> Fry Node) | 6647.784741 tokens |
| FGCOER2A6CWC... | 3469720617 (Fry -> Fry) | 6545.046653 tokens |
| FMVQGM4DCVL2... | 3473574550 (Fry Node -> Fry Node) | 6378.567458 tokens |
| 6UG2TUJVHQZO... | 3469720617 (Fry -> Fry) | 1319.835271 tokens |
| FGCOER2A6CWC... | 3468848937 (USD Coin -> Fry) | 1186.607351 tokens |
