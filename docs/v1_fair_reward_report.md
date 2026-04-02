# V1 Fair Reward Audit — Epoch-Based Proportional Share

Generated: 2026-03-17T01:47:54.572Z

## Methodology

APR values are unrecoverable (corrupted by dynamic recalculation on every stake/unstake).
Instead, fair rewards are calculated from first principles:

1. Each pool was funded with X reward tokens for Y duration
2. Reward rate = X / Y per second
3. Each stake/unstake event creates an "epoch" boundary
4. Within each epoch, rewards split proportionally by stake size
5. Sum per-user rewards across all epochs = fair reward

`rewards_distributed = 0` for all pools (V1 truncation bug = no rewards ever paid).

## Summary

| Metric | Value |
|--------|-------|
| Total users | 86 |
| Current stakers | 61 |
| Migrated users | 25 |
| Users owed (delta > 0) | 78 |
| Users overpaid (delta < 0) | 8 |
| Total fair rewards | 708274.593187 tokens |
| Total V1 would pay | 356774.743936 tokens |
| Total already refunded | 46.450287 tokens |
| **Net treasury obligation** | **353292.004050 tokens** |
| Total V1 overpayment | 1838.605086 tokens |

## Per-Pool Summary

| App ID | Pool | Funded | Epochs | Users | Fair Reward | V1 Pays | Delta | Over Budget? |
|--------|------|--------|--------|-------|------------|---------|-------|--------------|
| 3465579498 | Fry -> Fry | 199 | 18 | 8 (1+7) | 157.012 | 429.900 | -274.336 | no |
| 3468848937 | USD Coin -> Fry | 4137 | 27 | 14 (5+9) | 3706.683 | 2347.423 | 1332.719 | no |
| 3469720617 | Fry -> Fry | 15937199 | 49 | 29 (25+4) | 421575.200 | 172314.061 | 249242.677 | no |
| 3470020844 | Fry -> Fry | 4638 | 33 | 12 (12+0) | 3105.147 | 1836.690 | 1268.457 | no |
| 3473560676 | Fry Node -> Fry Node | 7022701 | 18 | 14 (11+3) | 112795.450 | 69185.992 | 43609.458 | no |
| 3473562061 | Fry VPN -> Fry VPN | 127395 | 2 | 2 (2+0) | 2012.775 | 1256.497 | 756.278 | no |
| 3473563847 | Fry -> Fry | 6221249 | 4 | 3 (2+1) | 98334.446 | 61360.200 | 36974.246 | no |
| 3473565258 | Fry Node -> Fry Node | 3514402 | 1 | 1 (0+1) | 47.251 | 0.000 | 47.251 | no |
| 3473566323 | Fry VPN -> Fry VPN | 63694 | 0 | 0 (0+0) | 0.000 | 0.000 | 0.000 | no |
| 3473573376 | Fry -> Fry | 3113835 | 1 | 1 (1+0) | 42535.707 | 30711.499 | 11824.208 | no |
| 3473574550 | Fry Node -> Fry Node | 1757502 | 2 | 2 (2+0) | 24004.922 | 17332.481 | 6672.441 | no |

### Pool 3465579498 — Fry -> Fry

- Funded: 199.049 tokens
- Period: 2026-03-02 to 2026-03-07 (5d)
- Epochs: 18
- Users: 8 (1 current, 7 migrated)
- Fair reward sum: 157.012166 tokens
- V1 would pay: 429.900000 tokens
- Pool delta: -274.336173 tokens

| Wallet | Status | Fair Reward | V1 Pays | Refunded | Delta |
|--------|--------|------------|---------|----------|-------|
| HD4TS4HQ... | current | 66.502 | 429.900 | 0.000 | -363.398 |
| S7OSRZCJ... | migrated | 63.586 | 0.000 | 0.000 | 63.586 |
| HQK4C6ZT... | migrated | 23.614 | 0.000 | 0.001 | 23.613 |
| XETLSDPE... | migrated | 2.868 | 0.000 | 1.254 | 1.614 |
| WFOELFUQ... | migrated | 0.291 | 0.000 | 0.052 | 0.238 |
| D7F47755... | migrated | 0.110 | 0.000 | 0.141 | -0.032 |
| CKMHAQKU... | migrated | 0.042 | 0.000 | 0.000 | 0.042 |
| 6UG2TUJV... | migrated | 0.000 | 0.000 | 0.000 | 0.000 |

### Pool 3468848937 — USD Coin -> Fry

- Funded: 4137.066 tokens
- Period: 2026-03-06 to 2026-03-13 (7d)
- Epochs: 27
- Users: 14 (5 current, 9 migrated)
- Fair reward sum: 3706.682922 tokens
- V1 would pay: 2347.423466 tokens
- Pool delta: 1332.719335 tokens

| Wallet | Status | Fair Reward | V1 Pays | Refunded | Delta |
|--------|--------|------------|---------|----------|-------|
| J6P3YDW7... | migrated | 1777.651 | 0.000 | 0.000 | 1777.651 |
| D7F47755... | current | 566.590 | 614.143 | 7.896 | -55.448 |
| XETLSDPE... | migrated | 540.858 | 0.000 | 8.889 | 531.969 |
| CKMHAQKU... | current | 297.766 | 429.900 | 0.000 | -132.134 |
| 3KSLWW7K... | migrated | 154.393 | 0.000 | 0.000 | 154.393 |
| FGCOER2A... | current | 138.083 | 1281.901 | 0.000 | -1143.818 |
| FMVQGM4D... | migrated | 83.868 | 0.000 | 0.000 | 83.868 |
| HQK4C6ZT... | migrated | 63.121 | 0.000 | 5.031 | 58.090 |
| SAF4L4OS... | migrated | 61.556 | 0.000 | 4.724 | 56.832 |
| 3FD4MSYU... | migrated | 15.912 | 0.000 | 0.000 | 15.912 |
| 3MCHLCXE... | current | 6.369 | 18.424 | 0.000 | -12.055 |
| O7IVZIWK... | migrated | 0.309 | 0.000 | 0.000 | 0.309 |
| XTZEJ4EJ... | migrated | 0.150 | 0.000 | 0.000 | 0.150 |
| S7OSRZCJ... | current | 0.057 | 3.055 | 0.000 | -2.999 |

### Pool 3469720617 — Fry -> Fry

- Funded: 15937199.060 tokens
- Period: 2026-03-07 to 2027-03-07 (365d)
- Epochs: 49
- Users: 29 (25 current, 4 migrated)
- Fair reward sum: 421575.200347 tokens
- V1 would pay: 172314.061462 tokens
- Pool delta: 249242.677058 tokens

| Wallet | Status | Fair Reward | V1 Pays | Refunded | Delta |
|--------|--------|------------|---------|----------|-------|
| 3KSLWW7K... | current | 197972.520 | 100455.060 | 0.000 | 97517.460 |
| FGCOER2A... | current | 58734.793 | 7074.300 | 0.000 | 51660.493 |
| O7IVZIWK... | current | 57052.798 | 24057.336 | 0.000 | 32995.462 |
| SAF4L4OS... | current | 17285.976 | 10375.640 | 0.000 | 6910.336 |
| WFOELFUQ... | current | 16874.039 | 27.354 | 0.000 | 16846.685 |
| 3MCHLCXE... | migrated | 16096.188 | 0.000 | 0.000 | 16096.188 |
| HQK4C6ZT... | current | 15900.910 | 9480.505 | 0.000 | 6420.405 |
| XETLSDPE... | current | 15631.303 | 9432.400 | 0.000 | 6198.903 |
| K6YAELU4... | current | 7876.515 | 4885.892 | 18.462 | 2972.162 |
| S7OSRZCJ... | current | 4697.647 | 5.188 | 0.000 | 4692.459 |
| 6UG2TUJV... | current | 3731.076 | 1419.576 | 0.000 | 2311.500 |
| HD4TS4HQ... | current | 3246.679 | 2939.520 | 0.000 | 307.159 |
| GZFBBGT5... | current | 3208.499 | 0.943 | 0.000 | 3207.556 |
| ZS5OGNCK... | current | 1204.004 | 943.240 | 0.000 | 260.764 |
| QMF244XQ... | current | 837.784 | 799.233 | 0.000 | 38.551 |
| VNRQZAX4... | migrated | 324.496 | 0.000 | 0.000 | 324.496 |
| XTZEJ4EJ... | migrated | 318.799 | 0.000 | 0.000 | 318.799 |
| RAFYQLYP... | current | 185.564 | 180.331 | 0.000 | 5.232 |
| IVZBBARA... | current | 106.393 | 89.608 | 0.000 | 16.785 |
| JILQRZXI... | migrated | 88.168 | 0.000 | 0.000 | 88.168 |
| JOSSUIJF... | current | 54.704 | 42.845 | 0.000 | 11.859 |
| NLWZTXWG... | current | 54.320 | 35.605 | 0.000 | 18.716 |
| C7QJMEPT... | current | 39.789 | 27.453 | 0.000 | 12.335 |
| 42TRM7VU... | current | 18.494 | 15.563 | 0.000 | 2.930 |
| S7UK3J65... | current | 11.250 | 9.432 | 0.000 | 1.818 |
| P744HKOJ... | current | 9.198 | 6.010 | 0.000 | 3.188 |
| FKULJE4P... | current | 5.801 | 4.716 | 0.000 | 1.085 |
| AHR3OGEL... | current | 4.607 | 3.729 | 0.000 | 0.878 |
| RETW2VNG... | current | 2.888 | 2.581 | 0.000 | 0.307 |

### Pool 3470020844 — Fry -> Fry

- Funded: 4638.411 tokens
- Period: 2026-03-06 to 2026-03-20 (14d)
- Epochs: 33
- Users: 12 (12 current, 0 migrated)
- Fair reward sum: 3105.147232 tokens
- V1 would pay: 1836.690018 tokens
- Pool delta: 1268.457214 tokens

| Wallet | Status | Fair Reward | V1 Pays | Refunded | Delta |
|--------|--------|------------|---------|----------|-------|
| XETLSDPE... | current | 783.793 | 661.791 | 0.000 | 122.002 |
| 3MCHLCXE... | current | 560.722 | 220.959 | 0.000 | 339.763 |
| O7IVZIWK... | current | 548.250 | 37.188 | 0.000 | 511.062 |
| D7F47755... | current | 466.057 | 464.850 | 0.000 | 1.207 |
| K6YAELU4... | current | 459.153 | 286.088 | 0.000 | 173.065 |
| FGCOER2A... | current | 191.008 | 123.960 | 0.000 | 67.048 |
| 6UG2TUJV... | current | 80.605 | 31.300 | 0.000 | 49.305 |
| C7QJMEPT... | current | 8.965 | 6.198 | 0.000 | 2.767 |
| TXDBUB2E... | current | 4.224 | 3.099 | 0.000 | 1.125 |
| C3OBUOZO... | current | 1.149 | 0.309 | 0.000 | 0.840 |
| FKULJE4P... | current | 0.704 | 0.620 | 0.000 | 0.084 |
| WFOELFUQ... | current | 0.517 | 0.328 | 0.000 | 0.189 |

### Pool 3473560676 — Fry Node -> Fry Node

- Funded: 7022700.760 tokens
- Period: 2026-03-10 to 2027-03-10 (365d)
- Epochs: 18
- Users: 14 (11 current, 3 migrated)
- Fair reward sum: 112795.450298 tokens
- V1 would pay: 69185.992206 tokens
- Pool delta: 43609.458092 tokens

| Wallet | Status | Fair Reward | V1 Pays | Refunded | Delta |
|--------|--------|------------|---------|----------|-------|
| 3KSLWW7K... | current | 57359.083 | 44380.000 | 0.000 | 12979.083 |
| MVDHJTPI... | current | 29335.951 | 10778.000 | 0.000 | 18557.951 |
| HD4TS4HQ... | current | 10269.399 | 10398.120 | 0.000 | -128.721 |
| VNRQZAX4... | migrated | 7826.133 | 0.000 | 0.000 | 7826.133 |
| TU3ZQOJV... | migrated | 2463.350 | 0.000 | 0.000 | 2463.350 |
| RETW2VNG... | current | 1599.798 | 1577.075 | 0.000 | 22.723 |
| K6YAELU4... | current | 1025.464 | 401.899 | 0.000 | 623.565 |
| RAFYQLYP... | migrated | 1016.192 | 0.000 | 0.000 | 1016.192 |
| 6UG2TUJV... | current | 647.702 | 630.830 | 0.000 | 16.872 |
| 42TRM7VU... | current | 442.707 | 412.100 | 0.000 | 30.607 |
| JOSSUIJF... | current | 343.874 | 293.846 | 0.000 | 50.028 |
| C7QJMEPT... | current | 287.429 | 173.471 | 0.000 | 113.957 |
| UV5CWWZC... | current | 171.282 | 134.311 | 0.000 | 36.972 |
| FKULJE4P... | current | 7.084 | 6.340 | 0.000 | 0.744 |

### Pool 3473562061 — Fry VPN -> Fry VPN

- Funded: 127394.850 tokens
- Period: 2026-03-10 to 2027-03-10 (365d)
- Epochs: 2
- Users: 2 (2 current, 0 migrated)
- Fair reward sum: 2012.774803 tokens
- V1 would pay: 1256.497127 tokens
- Pool delta: 756.277676 tokens

| Wallet | Status | Fair Reward | V1 Pays | Refunded | Delta |
|--------|--------|------------|---------|----------|-------|
| K6YAELU4... | current | 1550.586 | 838.736 | 0.000 | 711.850 |
| HD4TS4HQ... | current | 462.188 | 417.761 | 0.000 | 44.427 |

### Pool 3473563847 — Fry -> Fry

- Funded: 6221249.420 tokens
- Period: 2026-03-10 to 2027-03-10 (365d)
- Epochs: 4
- Users: 3 (2 current, 1 migrated)
- Fair reward sum: 98334.446097 tokens
- V1 would pay: 61360.200013 tokens
- Pool delta: 36974.246084 tokens

| Wallet | Status | Fair Reward | V1 Pays | Refunded | Delta |
|--------|--------|------------|---------|----------|-------|
| K6YAELU4... | current | 98032.041 | 61150.500 | 0.000 | 36881.540 |
| HD4TS4HQ... | current | 231.966 | 209.700 | 0.000 | 22.266 |
| FMVQGM4D... | migrated | 70.440 | 0.000 | 0.000 | 70.440 |

### Pool 3473565258 — Fry Node -> Fry Node

- Funded: 3514401.980 tokens
- Period: 2026-03-10 to 2027-03-10 (365d)
- Epochs: 1
- Users: 1 (0 current, 1 migrated)
- Fair reward sum: 47.250965 tokens
- V1 would pay: 0.000000 tokens
- Pool delta: 47.250965 tokens

| Wallet | Status | Fair Reward | V1 Pays | Refunded | Delta |
|--------|--------|------------|---------|----------|-------|
| FMVQGM4D... | migrated | 47.251 | 0.000 | 0.000 | 47.251 |

### Pool 3473566323 — Fry VPN -> Fry VPN

- Funded: 63693.580 tokens
- Period: 2026-03-10 to 2027-03-10 (365d)
- Epochs: 0
- Users: 0 (0 current, 0 migrated)
- Fair reward sum: 0.000000 tokens
- V1 would pay: 0.000000 tokens
- Pool delta: 0.000000 tokens

*No users.*

### Pool 3473573376 — Fry -> Fry

- Funded: 3113835.420 tokens
- Period: 2026-03-10 to 2027-03-10 (365d)
- Epochs: 1
- Users: 1 (1 current, 0 migrated)
- Fair reward sum: 42535.706708 tokens
- V1 would pay: 30711.499081 tokens
- Pool delta: 11824.207627 tokens

| Wallet | Status | Fair Reward | V1 Pays | Refunded | Delta |
|--------|--------|------------|---------|----------|-------|
| FMVQGM4D... | current | 42535.707 | 30711.499 | 0.000 | 11824.208 |

### Pool 3473574550 — Fry Node -> Fry Node

- Funded: 1757501.600 tokens
- Period: 2026-03-10 to 2027-03-10 (365d)
- Epochs: 2
- Users: 2 (2 current, 0 migrated)
- Fair reward sum: 24004.921649 tokens
- V1 would pay: 17332.480563 tokens
- Pool delta: 6672.441086 tokens

| Wallet | Status | Fair Reward | V1 Pays | Refunded | Delta |
|--------|--------|------------|---------|----------|-------|
| FMVQGM4D... | current | 23627.224 | 17055.281 | 0.000 | 6571.943 |
| TXDBUB2E... | current | 377.698 | 277.200 | 0.000 | 100.498 |

## Top 20 Treasury Obligations

| Wallet | Pool | Status | Fair Reward | V1 Pays | Delta Owed |
|--------|------|--------|------------|---------|-----------|
| 3KSLWW7KIUGI... | 3469720617 | current | 197972.520 | 100455.060 | 97517.459511 |
| FGCOER2A6CWC... | 3469720617 | current | 58734.793 | 7074.300 | 51660.493489 |
| K6YAELU4EETZ... | 3473563847 | current | 98032.041 | 61150.500 | 36881.540337 |
| O7IVZIWKKCJY... | 3469720617 | current | 57052.798 | 24057.336 | 32995.461879 |
| MVDHJTPITMSI... | 3473560676 | current | 29335.951 | 10778.000 | 18557.950767 |
| WFOELFUQR23P... | 3469720617 | current | 16874.039 | 27.354 | 16846.685483 |
| 3MCHLCXEUZML... | 3469720617 | migrated | 16096.188 | 0.000 | 16096.187650 |
| 3KSLWW7KIUGI... | 3473560676 | current | 57359.083 | 44380.000 | 12979.083481 |
| FMVQGM4DCVL2... | 3473573376 | current | 42535.707 | 30711.499 | 11824.207627 |
| VNRQZAX4M4AU... | 3473560676 | migrated | 7826.133 | 0.000 | 7826.133480 |
| SAF4L4OSPL6N... | 3469720617 | current | 17285.976 | 10375.640 | 6910.336342 |
| FMVQGM4DCVL2... | 3473574550 | current | 23627.224 | 17055.281 | 6571.943108 |
| HQK4C6ZTG6PR... | 3469720617 | current | 15900.910 | 9480.505 | 6420.404577 |
| XETLSDPESZHW... | 3469720617 | current | 15631.303 | 9432.400 | 6198.902963 |
| S7OSRZCJ4KOC... | 3469720617 | current | 4697.647 | 5.188 | 4692.458729 |
| GZFBBGT5S4RE... | 3469720617 | current | 3208.499 | 0.943 | 3207.556164 |
| K6YAELU4EETZ... | 3469720617 | current | 7876.515 | 4885.892 | 2972.161585 |
| TU3ZQOJVHDUQ... | 3473560676 | migrated | 2463.350 | 0.000 | 2463.349933 |
| 6UG2TUJVHQZO... | 3469720617 | current | 3731.076 | 1419.576 | 2311.499731 |
| J6P3YDW72L4T... | 3468848937 | migrated | 1777.651 | 0.000 | 1777.651153 |

## Overpayment Summary (V1 Pays More Than Fair — No Airdrop Needed)

| Wallet | Pool | Fair Reward | V1 Pays | Overpayment |
|--------|------|------------|---------|-------------|
| FGCOER2A6CWC... | 3468848937 | 138.083 | 1281.901 | 1143.817888 |
| HD4TS4HQQB2Y... | 3465579498 | 66.502 | 429.900 | 363.397894 |
| CKMHAQKU5FCN... | 3468848937 | 297.766 | 429.900 | 132.134367 |
| HD4TS4HQQB2Y... | 3473560676 | 10269.399 | 10398.120 | 128.721178 |
| D7F477557T66... | 3468848937 | 566.590 | 614.143 | 55.448296 |
| 3MCHLCXEUZML... | 3468848937 | 6.369 | 18.424 | 12.055060 |
| S7OSRZCJ4KOC... | 3468848937 | 0.057 | 3.055 | 2.998744 |
| D7F477557T66... | 3465579498 | 0.110 | 0.000 | 0.031659 |

## Comparison Across Audit Iterations

| Audit | Method | Total Owed |
|-------|--------|-----------|
| v1RewardAudit | MongoDB APR | ~416,874 FRY |
| v1OnChainInvestigation | Current on-chain APR | ~202,830 tokens |
| v1OriginalAprRecovery | First-stake APR | ~98B tokens (broken — dynamic APR) |
| **v1FairRewardAudit** | **Epoch proportional share** | **353292.004050 tokens** |
