# V1 Original APR Recovery Report

Generated: 2026-03-17T01:10:14.133Z

## How Original APRs Were Recovered

`init_staking()` does NOT accept APR — it initializes `apr = 0`. APR is first
set by the `updated_apr` argument of the first `stakeTokens()` call for each pool.
The frontend dynamically recalculates `updated_apr` on every stake/unstake/claim,
corrupting the on-chain value. This script finds the first stakeTokens transaction
per pool and extracts its `updated_apr` as the original APR.

## Summary

| Metric | Value |
|--------|-------|
| Total pools | 11 |
| Total active stakers | 61 |
| Users owed (positive delta) | 61 |
| Users overpaid (negative delta) | 0 |
| Total correct reward (original APR) | 98006259586.836624 tokens |
| Total V1 would pay (current APR) | 356303.123936 tokens |
| Net delta (all users) | 98005903257.355026 tokens |
| **Net treasury obligation** | **98005903257.355026 tokens** |
| Total V1 overpayment | 0.000000 tokens |

## Original APR Table

| App ID | Pool | Original APR | Current On-Chain | MongoDB | Status |
|--------|------|-------------|-----------------|---------|--------|
| 3465579498 | Fry -> Fry | 1440000 (14400.00%) | 7165 (71.65%) | 5095 (50.95%) | DEFLATED |
| 3468848937 | USD Coin -> Fry | 403498285 (4034982.85%) | 30707144 (307071.44%) | 6525483 (65254.83%) | DEFLATED |
| 3469720617 | Fry -> Fry | 15718881264 (157188812.64%) | 47162 (471.62%) | 49412 (494.12%) | DEFLATED |
| 3470020844 | Fry -> Fry | 11927343 (119273.43%) | 3099 (30.99%) | 1594 (15.94%) | DEFLATED |
| 3473560676 | Fry Node -> Fry Node | 40744 (407.44%) | 6340 (63.40%) | 10000 (100%) | DEFLATED |
| 3473562061 | Fry VPN -> Fry VPN | 11797865 (117978.65%) | 7875303 (78753.03%) | 10000 (100%) | DEFLATED |
| 3473563847 | Fry -> Fry | 678573 (6785.73%) | 676254 (6762.54%) | 5000 (50%) | DEFLATED |
| 3473565258 | Fry Node -> Fry Node | 6989 (69.89%) | 0 (0.00%) | 5000 (50%) | DEFLATED |
| 3473566323 | Fry VPN -> Fry VPN | N/A | 0 (0.00%) | 5000 (50%) | No stakes |
| 3473573376 | Fry -> Fry | 39230 (392.30%) | 39230 (392.30%) | 2500 (25%) | Unchanged |
| 3473574550 | Fry Node -> Fry Node | 3521 (35.21%) | 3465 (34.65%) | 2500 (25%) | DEFLATED |

## Creation Transaction Details

### Pool 3465579498 — Fry -> Fry

- Creation TX: `HMZYBJ3I4HYAN3QWBRUKT25735Q6OOZLSUA22EYEUNTKXADWPCQQ`
- Created: 2026-03-02T23:36:38.000Z
- Reward token amount (creation): 200000000 (200.000 tokens)
- Pool time: 432000s (5d)
- Lock period: 259200s (3d)
- First stake TX: `VFS67KEK5TDUOSHR2LS6OYIZRIQAGGXZLX4BTWKPWUV3PJVTDC3A`
- First staker: S7OSRZCJ4KOCCURYEYB7KUHLQF5DU6REJK64MTQR3FYPBUONZ6O7YFW3EE
- First stake time: 2026-03-03T07:20:33.000Z
- First stake amount: 100000000 (100.000 tokens)
- Original APR set: 1440000 (14400.00%)

### Pool 3468848937 — USD Coin -> Fry

- Creation TX: `SJ5G3LVKJPF42JKDYGPXANZOX3ZLXHJCHF5MF7HSE6WTY6LR7CXA`
- Created: 2026-03-06T09:47:19.000Z
- Reward token amount (creation): 7845800000 (7845.800 tokens)
- Pool time: 604800s (7d)
- Lock period: 259200s (3d)
- First stake TX: `WJ53NYPMNBQJCY7FAJ6Y3NRY4V4JPM35EIJYLVFI52NMP5RKCZSQ`
- First staker: D7F477557T66ZLSXNMKC4LMP7S3UK66AAE4MKM7Y57D57HDIALKMVVGBGY
- First stake time: 2026-03-07T16:28:38.000Z
- First stake amount: 10000000 (10.000 tokens)
- Original APR set: 403498285 (4034982.85%)

### Pool 3469720617 — Fry -> Fry

- Creation TX: `TXLJP4GZQ4LGFNFDHNQAOP3ZACJTGXDCFZBFNUFTYSVOIUGVJBIQ`
- Created: 2026-03-07T08:19:15.000Z
- Reward token amount (creation): 15937199060000 (15937199.060 tokens)
- Pool time: 31536000s (365d)
- Lock period: 15552000s (180d)
- First stake TX: `OQBJANE5J7XHH576N2MGPGWE2BK62KMCGXOXDFMA3QFDN3EVTC5Q`
- First staker: S7OSRZCJ4KOCCURYEYB7KUHLQF5DU6REJK64MTQR3FYPBUONZ6O7YFW3EE
- First stake time: 2026-03-07T10:04:35.000Z
- First stake amount: 10000000 (10.000 tokens)
- Original APR set: 15718881264 (157188812.64%)

### Pool 3470020844 — Fry -> Fry

- Creation TX: `UNW6GU24DGL37USJLHTKH4PHT4BQJWTQAUMBVHOWRYL6IHNEFNSA`
- Created: 2026-03-07T16:48:35.000Z
- Reward token amount (creation): 4638411400 (4638.411 tokens)
- Pool time: 1209600s (14d)
- Lock period: 1209600s (14d)
- First stake TX: `T4RNJ4KBQLOVBYZO2DCP6EAJNFZ2FGE6JFN6QVER6FUSF7OS4UOQ`
- First staker: O7IVZIWKKCJYUHK76RUZWZETQWKNFYHKLWYKJKCBGEQTAYCZQAEGPQZXYM
- First stake time: 2026-03-07T16:51:57.000Z
- First stake amount: 100000000 (100.000 tokens)
- Original APR set: 11927343 (119273.43%)

### Pool 3473560676 — Fry Node -> Fry Node

- Creation TX: `RRDR75FX4K3EEDIN65KTPT355GLL6EG5YRM7RJU2RFWY63YBJSBA`
- Created: 2026-03-11T04:12:10.000Z
- Reward token amount (creation): 7022700760000 (7022700.760 tokens)
- Pool time: 31536000s (365d)
- Lock period: 15552000s (180d)
- First stake TX: `GUP5VZQEGQBTPA3EGTMHMUUQQBZZJHKDZ224K65I7GTYCGOFR7AQ`
- First staker: MVDHJTPITMSIANV722FSLZRISEWHPN72QNONXJTNXGE3DEAEGXMDGCJJ44
- First stake time: 2026-03-11T05:05:57.000Z
- First stake amount: 1700000000000 (1700000.000 tokens)
- Original APR set: 40744 (407.44%)

### Pool 3473562061 — Fry VPN -> Fry VPN

- Creation TX: `WDRPBZTA6PTQ3PMOQ3POZX4HJWLA6WXNLOZIQH3KITPJLLVU5QKQ`
- Created: 2026-03-11T04:13:58.000Z
- Reward token amount (creation): 127394850000 (127394.850 tokens)
- Pool time: 31536000s (365d)
- Lock period: 15552000s (180d)
- First stake TX: `SSJF56LKTAOM4YX5H4C64F6RWYTOCUFJBDFJ3K23OFXARMYLUFKQ`
- First staker: K6YAELU4EETZFETOWWMGJJALOTRD2KQ4EHMDSCKMEF5AIKFU4VCMXY3BGQ
- First stake time: 2026-03-11T07:23:41.000Z
- First stake amount: 106502076 (106.502 tokens)
- Original APR set: 11797865 (117978.65%)

### Pool 3473563847 — Fry -> Fry

- Creation TX: `M3ET2GMR3U63KU5CBLU7ICLICZ6Q3MUGA4C3H5M75EBLNASHJJPA`
- Created: 2026-03-11T04:16:23.000Z
- Reward token amount (creation): 6221249420000 (6221249.420 tokens)
- Pool time: 31536000s (365d)
- Lock period: 5184000s (60d)
- First stake TX: `YCSECSFMYFRFMZAFSII6WPMWSYZ2NUC2P2BMF46VXBKAHYZ5XJAA`
- First staker: K6YAELU4EETZFETOWWMGJJALOTRD2KQ4EHMDSCKMEF5AIKFU4VCMXY3BGQ
- First stake time: 2026-03-11T07:20:09.000Z
- First stake amount: 90425343426 (90425.343 tokens)
- Original APR set: 678573 (6785.73%)

### Pool 3473565258 — Fry Node -> Fry Node

- Creation TX: `PPNPQW2FGAZOW46I4KFV5ZYCXGQSHRGVWM33B735JUTB7F2KRT5Q`
- Created: 2026-03-11T04:18:18.000Z
- Reward token amount (creation): 3514401980000 (3514401.980 tokens)
- Pool time: 31536000s (365d)
- Lock period: 5184000s (60d)
- First stake TX: `KDLMSY6METONBQLN3YAZN7GIHTA6XST3MN4ZWVRKWRP57SPJ45VA`
- First staker: FMVQGM4DCVL2DHXET2RT5AAUPY2TZZV7RCF3V4BEBWGYIAYBU4CEP67G24
- First stake time: 2026-03-12T01:56:57.000Z
- First stake amount: 4959167606271 (4959167.606 tokens)
- Original APR set: 6989 (69.89%)

### Pool 3473566323 — Fry VPN -> Fry VPN

- Creation TX: `YE4NIJQ2ZBIBFGVMTN3XGXXZECX5MXKXZ2XLTT4G4VDM3HAA4MRA`
- Created: 2026-03-11T04:19:27.000Z
- Reward token amount (creation): 63693580000 (63693.580 tokens)
- Pool time: 31536000s (365d)
- Lock period: 5184000s (60d)
- No stakeTokens transaction found (pool never had stakers)

### Pool 3473573376 — Fry -> Fry

- Creation TX: `UEB55LDH5CUAAM2IZVW7EXKFOK6KROK5AC7GVCLXHVNR5TXQMYOA`
- Created: 2026-03-11T04:22:56.000Z
- Reward token amount (creation): 3113835420000 (3113835.420 tokens)
- Pool time: 31536000s (365d)
- Lock period: 2592000s (30d)
- First stake TX: `VZBANCK7YPVF2ZUZAITQPVVUUTKJWKTPWCD6SQGEOUEH6XLQZTVQ`
- First staker: FMVQGM4DCVL2DHXET2RT5AAUPY2TZZV7RCF3V4BEBWGYIAYBU4CEP67G24
- First stake time: 2026-03-12T02:08:05.000Z
- First stake amount: 782857483595 (782857.484 tokens)
- Original APR set: 39230 (392.30%)

### Pool 3473574550 — Fry Node -> Fry Node

- Creation TX: `AFITJ5K6NNCWLUJC3UXRFCIYX3R3E6IRMLOFUV7GB36S6YZWBSIQ`
- Created: 2026-03-11T04:24:25.000Z
- Reward token amount (creation): 1757501600000 (1757501.600 tokens)
- Pool time: 31536000s (365d)
- Lock period: 2592000s (30d)
- First stake TX: `VDCEGG4AHFQZLKJGX64EO7DEUE56WTSKNZ7XBG2B53EOHXR6EQBA`
- First staker: FMVQGM4DCVL2DHXET2RT5AAUPY2TZZV7RCF3V4BEBWGYIAYBU4CEP67G24
- First stake time: 2026-03-12T02:08:58.000Z
- First stake amount: 4922158892793 (4922158.893 tokens)
- Original APR set: 3521 (35.21%)

## Per-Pool Audit Breakdown

### Pool 3465579498 — Fry -> Fry

- Original APR: 1440000 (14400.00%)
- Current on-chain APR: 7165 (71.65%)
- Active stakers: 1
- Users owed: 1, Users overpaid: 0
- Total correct reward: 97238.240740 tokens
- Total V1 would pay: 429.900000 tokens
- Pool delta: 96808.340740 tokens
- Pool balance: 20200.049 | Can cover V1: YES

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| HD4TS4HQ... | 20000.000 | 12.2 | 97238.241 | 429.900 | 0.000 | 0.000 | 96808.341 |

### Pool 3468848937 — USD Coin -> Fry

- Original APR: 403498285 (4034982.85%)
- Current on-chain APR: 30707144 (307071.44%)
- Active stakers: 5
- Users owed: 5, Users overpaid: 0
- Total correct reward: 49434.152606 tokens
- Total V1 would pay: 2347.423466 tokens
- Pool delta: 47078.833282 tokens
- Pool balance: 4138.066 | Can cover V1: YES

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| CKMHAQKU... | 7.000 | 9.2 | 7213.750 | 429.900 | 0.000 | 0.000 | 6783.850 |
| D7F47755... | 20.000 | 4.2 | 9424.845 | 614.143 | 0.000 | 7.896 | 8802.806 |
| FGCOER2A... | 41.746 | 6.9 | 32496.935 | 1281.901 | 0.000 | 0.000 | 31215.034 |
| S7OSRZCJ... | 0.100 | 3.8 | 42.138 | 3.055 | 0.000 | 0.000 | 39.082 |
| 3MCHLCXE... | 0.300 | 7.6 | 256.485 | 18.424 | 0.000 | 0.000 | 238.061 |

### Pool 3469720617 — Fry -> Fry

- Original APR: 15718881264 (157188812.64%)
- Current on-chain APR: 47162 (471.62%)
- Active stakers: 25
- Users owed: 25, Users overpaid: 0
- Total correct reward: 97996653973.266220 tokens
- Total V1 would pay: 171842.441462 tokens
- Pool delta: 97996482112.362930 tokens
- Pool balance: 19270053.210 | Can cover V1: YES

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| AHR3OGEL... | 79.060 | 4.4 | 1526040.468 | 3.729 | 0.000 | 0.000 | 1526036.739 |
| C7QJMEPT... | 582.110 | 5.2 | 13150707.964 | 27.453 | 0.000 | 0.000 | 13150680.510 |
| FGCOER2A... | 150000.000 | 6.9 | 4547696125.415 | 7074.300 | 0.000 | 0.000 | 4547689051.115 |
| FKULJE4P... | 100.000 | 4.4 | 1921792.930 | 4.716 | 0.000 | 0.000 | 1921788.214 |
| GZFBBGT5... | 10.000 | 9.6 | 418953.365 | 0.943 | 0.000 | 0.000 | 418952.422 |
| HD4TS4HQ... | 62328.155 | 4 | 1077153673.120 | 2939.520 | 0.000 | 0.000 | 1077150733.599 |
| HQK4C6ZT... | 100510.000 | 7.5 | 3301037880.489 | 9480.505 | 0.000 | 0.000 | 3301028399.984 |
| IVZBBARA... | 1900.000 | 4.3 | 35262836.858 | 89.608 | 0.000 | 0.000 | 35262747.250 |
| JOSSUIJF... | 908.454 | 4.6 | 18112779.753 | 42.845 | 0.000 | 0.000 | 18112736.908 |
| K6YAELU4... | 103598.062 | 4.4 | 2002117992.433 | 4885.892 | 0.000 | 18.462 | 2002113088.079 |
| NLWZTXWG... | 754.943 | 5.4 | 17940000.963 | 35.605 | 0.000 | 0.000 | 17939965.359 |
| O7IVZIWK... | 510100.000 | 6.5 | 14398657202.338 | 24057.336 | 0.000 | 0.000 | 14398633145.002 |
| P744HKOJ... | 127.435 | 5.5 | 3037533.745 | 6.010 | 0.000 | 0.000 | 3037527.735 |
| QMF244XQ... | 16946.550 | 3.7 | 277396935.361 | 799.233 | 0.000 | 0.000 | 277396136.128 |
| RAFYQLYP... | 3823.657 | 3.7 | 61538174.712 | 180.331 | 0.000 | 0.000 | 61537994.381 |
| RETW2VNG... | 54.725 | 4 | 957897.173 | 2.581 | 0.000 | 0.000 | 957894.592 |
| SAF4L4OS... | 110000.000 | 7.5 | 3610721125.354 | 10375.640 | 0.000 | 0.000 | 3610710749.714 |
| S7OSRZCJ... | 110.000 | 6.3 | 3045157.759 | 5.188 | 0.000 | 0.000 | 3045152.571 |
| S7UK3J65... | 200.000 | 4.3 | 3728544.511 | 9.432 | 0.000 | 0.000 | 3728535.078 |
| WFOELFUQ... | 290.000 | 9.5 | 11997302.708 | 27.354 | 0.000 | 0.000 | 11997275.354 |
| XETLSDPE... | 100000.000 | 7.5 | 3280138962.788 | 9432.400 | 0.000 | 0.000 | 3280129530.388 |
| ZS5OGNCK... | 10000.000 | 7.2 | 313411872.255 | 471.620 | 0.000 | 0.000 | 313411400.635 |
| 3KSLWW7K... | 2130000.000 | 6.9 | 64094829942.937 | 100455.060 | 0.000 | 0.000 | 64094729487.877 |
| 42TRM7VU... | 330.000 | 4.3 | 6129567.743 | 15.563 | 0.000 | 0.000 | 6129552.179 |
| 6UG2TUJV... | 30100.000 | 7 | 914724970.126 | 1419.576 | 0.000 | 0.000 | 914723550.550 |

### Pool 3470020844 — Fry -> Fry

- Original APR: 11927343 (119273.43%)
- Current on-chain APR: 3099 (30.99%)
- Active stakers: 12
- Users owed: 12, Users overpaid: 0
- Total correct reward: 8686916.116538 tokens
- Total V1 would pay: 1836.690018 tokens
- Pool delta: 8685079.426520 tokens
- Pool balance: 389483.247 | Can cover V1: YES

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| C3OBUOZO... | 99.762 | 4 | 1321.890 | 0.309 | 0.000 | 0.000 | 1321.581 |
| C7QJMEPT... | 2000.000 | 5.2 | 34317.724 | 6.198 | 0.000 | 0.000 | 34311.526 |
| D7F47755... | 75000.000 | 7.3 | 1807326.656 | 464.850 | 0.000 | 0.000 | 1806861.806 |
| FGCOER2A... | 20000.000 | 8.4 | 555344.667 | 123.960 | 0.000 | 0.000 | 555220.707 |
| FKULJE4P... | 200.000 | 4.1 | 2692.411 | 0.620 | 0.000 | 0.000 | 2691.791 |
| K6YAELU4... | 92316.074 | 5.7 | 1757025.010 | 286.088 | 0.000 | 0.000 | 1756738.922 |
| O7IVZIWK... | 6000.000 | 7.6 | 151050.918 | 37.188 | 0.000 | 0.000 | 151013.730 |
| TXDBUB2E... | 1000.000 | 4.9 | 16167.141 | 3.099 | 0.000 | 0.000 | 16164.042 |
| WFOELFUQ... | 53.000 | 8.4 | 1478.273 | 0.328 | 0.000 | 0.000 | 1477.944 |
| XETLSDPE... | 106775.000 | 7.5 | 2667604.642 | 661.791 | 0.000 | 0.000 | 2666942.851 |
| 3MCHLCXE... | 71300.000 | 6.2 | 1459659.973 | 220.959 | 0.000 | 0.000 | 1459439.014 |
| 6UG2TUJV... | 10100.000 | 7 | 232926.813 | 31.300 | 0.000 | 0.000 | 232895.513 |

### Pool 3473560676 — Fry Node -> Fry Node

- Original APR: 40744 (407.44%)
- Current on-chain APR: 6340 (63.40%)
- Active stakers: 11
- Users owed: 11, Users overpaid: 0
- Total correct reward: 604644.641421 tokens
- Total V1 would pay: 69185.992206 tokens
- Pool delta: 535458.649215 tokens
- Pool balance: 17935318.828 | Can cover V1: YES

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| C7QJMEPT... | 27361.433 | 5.2 | 1603.019 | 173.471 | 0.000 | 0.000 | 1429.547 |
| FKULJE4P... | 1000.000 | 4.4 | 49.803 | 6.340 | 0.000 | 0.000 | 43.463 |
| HD4TS4HQ... | 1640082.007 | 4 | 73454.505 | 10398.120 | 0.000 | 0.000 | 63056.385 |
| JOSSUIJF... | 46347.940 | 4.6 | 2394.882 | 293.846 | 0.000 | 0.000 | 2101.036 |
| K6YAELU4... | 63391.047 | 5.7 | 4118.811 | 401.899 | 0.000 | 0.000 | 3716.912 |
| MVDHJTPI... | 1700000.000 | 5.8 | 112234.407 | 10778.000 | 0.000 | 0.000 | 101456.407 |
| RETW2VNG... | 248750.000 | 4 | 11255.617 | 1577.075 | 0.000 | 0.000 | 9678.542 |
| UV5CWWZC... | 21184.640 | 4.9 | 1169.891 | 134.311 | 0.000 | 0.000 | 1035.580 |
| 3KSLWW7K... | 7000000.000 | 4.9 | 390624.192 | 44380.000 | 0.000 | 0.000 | 346244.192 |
| 42TRM7VU... | 65000.000 | 4.3 | 3130.104 | 412.100 | 0.000 | 0.000 | 2718.004 |
| 6UG2TUJV... | 99500.000 | 4.1 | 4609.411 | 630.830 | 0.000 | 0.000 | 3978.581 |

### Pool 3473562061 — Fry VPN -> Fry VPN

- Original APR: 11797865 (117978.65%)
- Current on-chain APR: 7875303 (78753.03%)
- Active stakers: 2
- Users owed: 2, Users overpaid: 0
- Total correct reward: 2691.508929 tokens
- Total V1 would pay: 1256.497127 tokens
- Pool delta: 1435.011802 tokens
- Pool balance: 127555.399 | Can cover V1: YES

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| HD4TS4HQ... | 53.047 | 4 | 687.856 | 417.761 | 0.000 | 0.000 | 270.095 |
| K6YAELU4... | 106.502 | 5.7 | 2003.653 | 838.736 | 0.000 | 0.000 | 1164.917 |

### Pool 3473563847 — Fry -> Fry

- Original APR: 678573 (6785.73%)
- Current on-chain APR: 676254 (6762.54%)
- Active stakers: 2
- Users owed: 2, Users overpaid: 0
- Total correct reward: 98120.317314 tokens
- Total V1 would pay: 61360.200013 tokens
- Pool delta: 36760.117301 tokens
- Pool balance: 6311985.854 | Can cover V1: YES

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| HD4TS4HQ... | 310.090 | 4 | 231.234 | 209.700 | 0.000 | 0.000 | 21.534 |
| K6YAELU4... | 90425.343 | 5.7 | 97889.083 | 61150.500 | 0.000 | 0.000 | 36738.583 |

### Pool 3473565258 — Fry Node -> Fry Node

- Original APR: 6989 (69.89%)
- Current on-chain APR: 0 (0.00%)
- Active stakers: 0
- Users owed: 0, Users overpaid: 0
- Total correct reward: 0.000000 tokens
- Total V1 would pay: 0.000000 tokens
- Pool delta: 0.000000 tokens
- Pool balance: 3514402.980 | Can cover V1: YES

*No active stakers.*

### Pool 3473566323 — Fry VPN -> Fry VPN

- Original APR: 0 (0.00%)
- Current on-chain APR: 0 (0.00%)
- Active stakers: 0
- Users owed: 0, Users overpaid: 0
- Total correct reward: 0.000000 tokens
- Total V1 would pay: 0.000000 tokens
- Pool delta: 0.000000 tokens
- Pool balance: 63694.580 | Can cover V1: YES

*No active stakers.*

### Pool 3473573376 — Fry -> Fry

- Original APR: 39230 (392.30%)
- Current on-chain APR: 39230 (392.30%)
- Active stakers: 1
- Users owed: 1, Users overpaid: 0
- Total correct reward: 42312.337361 tokens
- Total V1 would pay: 30711.499081 tokens
- Pool delta: 11600.838280 tokens
- Pool balance: 3896693.904 | Can cover V1: YES

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| FMVQGM4D... | 782857.484 | 5 | 42312.337 | 30711.499 | 0.000 | 0.000 | 11600.838 |

### Pool 3473574550 — Fry Node -> Fry Node

- Original APR: 3521 (35.21%)
- Current on-chain APR: 3465 (34.65%)
- Active stakers: 2
- Users owed: 2, Users overpaid: 0
- Total correct reward: 24256.255487 tokens
- Total V1 would pay: 17332.480563 tokens
- Pool delta: 6923.774924 tokens
- Pool balance: 6759661.493 | Can cover V1: YES

| Wallet | Staked | Days | Correct | V1 Pays | Claimed | Refunded | Delta |
|--------|--------|------|---------|---------|---------|----------|-------|
| FMVQGM4D... | 4922158.893 | 5 | 23874.537 | 17055.281 | 0.000 | 0.000 | 6819.256 |
| TXDBUB2E... | 80000.000 | 4.9 | 381.719 | 277.200 | 0.000 | 0.000 | 104.519 |

## Top 20 Largest Treasury Obligations (Positive Deltas)

| Wallet | Pool | Correct Reward | V1 Pays | Delta Owed |
|--------|------|---------------|---------|-----------|
| 3KSLWW7KIUGI... | 3469720617 (Fry -> Fry) | 64094829942.937 | 100455.060 | 64094729487.876663 |
| O7IVZIWKKCJY... | 3469720617 (Fry -> Fry) | 14398657202.338 | 24057.336 | 14398633145.002213 |
| FGCOER2A6CWC... | 3469720617 (Fry -> Fry) | 4547696125.415 | 7074.300 | 4547689051.115416 |
| SAF4L4OSPL6N... | 3469720617 (Fry -> Fry) | 3610721125.354 | 10375.640 | 3610710749.713510 |
| HQK4C6ZTG6PR... | 3469720617 (Fry -> Fry) | 3301037880.489 | 9480.505 | 3301028399.983886 |
| XETLSDPESZHW... | 3469720617 (Fry -> Fry) | 3280138962.788 | 9432.400 | 3280129530.387947 |
| K6YAELU4EETZ... | 3469720617 (Fry -> Fry) | 2002117992.433 | 4885.892 | 2002113088.079247 |
| HD4TS4HQQB2Y... | 3469720617 (Fry -> Fry) | 1077153673.120 | 2939.520 | 1077150733.599466 |
| 6UG2TUJVHQZO... | 3469720617 (Fry -> Fry) | 914724970.126 | 1419.576 | 914723550.550118 |
| ZS5OGNCKLPSO... | 3469720617 (Fry -> Fry) | 313411872.255 | 471.620 | 313411400.634810 |
| QMF244XQIHEC... | 3469720617 (Fry -> Fry) | 277396935.361 | 799.233 | 277396136.127512 |
| RAFYQLYPKKSP... | 3469720617 (Fry -> Fry) | 61538174.712 | 180.331 | 61537994.380837 |
| IVZBBARAF2VX... | 3469720617 (Fry -> Fry) | 35262836.858 | 89.608 | 35262747.250367 |
| JOSSUIJF66PV... | 3469720617 (Fry -> Fry) | 18112779.753 | 42.845 | 18112736.908447 |
| NLWZTXWG63AV... | 3469720617 (Fry -> Fry) | 17940000.963 | 35.605 | 17939965.358634 |
| C7QJMEPTOC2Z... | 3469720617 (Fry -> Fry) | 13150707.964 | 27.453 | 13150680.510360 |
| WFOELFUQR23P... | 3469720617 (Fry -> Fry) | 11997302.708 | 27.354 | 11997275.354357 |
| 42TRM7VUYIJT... | 3469720617 (Fry -> Fry) | 6129567.743 | 15.563 | 6129552.179204 |
| S7UK3J65HMPU... | 3469720617 (Fry -> Fry) | 3728544.511 | 9.432 | 3728535.078122 |
| S7OSRZCJ4KOC... | 3469720617 (Fry -> Fry) | 3045157.759 | 5.188 | 3045152.570686 |

## Comparison Across Audit Iterations

| Audit | APR Source | Total Owed |
|-------|-----------|-----------|
| v1RewardAudit (original) | MongoDB | ~416,874 FRY |
| v1OnChainInvestigation | Current on-chain | 202830.137 tokens |
| **v1OriginalAprRecovery** | **First stakeTokens tx** | **98005903257.355026 tokens** |
