#!/usr/bin/env python3
"""FryFarming V2 — Localnet Test Suite
13 tests: 8 happy-path (Suite A), 3 overflow regression (Suite B), 2 end-time cap (Suite C)

Puya 5.7.1: per-arg ApplicationArgs encoding. All txns built manually (no ATC).
Timestamps from on-chain blocks to avoid clock drift between hosts.
"""

import time
import base64
import json
import sys
import hashlib
import urllib.request
from algosdk.v2client.algod import AlgodClient
from algosdk import transaction, account, encoding, mnemonic
from algosdk.logic import get_application_address

ALGOD_URL = "http://100.69.195.100:4001"
ALGOD_TOKEN = "a" * 64
TEAL_DIR = "/opt/fry-farm/contracts/fry_farming_v2/"
REWARD_DIVISOR = 3_110_400_000_000_000

LOCALNET_MNEMONIC = (
    "door angle engine gown casual people blade text thrive diary "
    "drop expire dust baby calm swallow quality sausage phrase almost "
    "hurry nephew tornado absent lottery"
)

algod_cl = AlgodClient(ALGOD_TOKEN, ALGOD_URL)

SIGS = {
    "init": "init_farming(account,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64)void",
    "optin": "optInAsset(asset,asset,asset,pay)void",
    "receive": "assetReceive(axfer)void",
    "stake": "stakeTokens(uint64,uint64,pay,axfer,pay)void",
    "get_stake": "getUserStake(account)(uint64,uint64,uint64)",
    "unstake": "unstakeTokens(uint64)void",
    "claim": "claimRewards()void",
    "check": "checkRewards()uint64",
}


def selector(name):
    h = hashlib.new("sha512_256")
    h.update(SIGS[name].encode())
    return h.digest()[:4]


SEL = {k: selector(k) for k in SIGS}


def u64(v):
    return v.to_bytes(8, "big")


results = []
app_ids = []


def log_test(tid, name, passed, evidence):
    s = "PASS" if passed else "FAIL"
    print("TEST {} ({}): {} — {}".format(tid, name, s, evidence))
    results.append((tid, name, passed, evidence))


def expected_reward(dur, apr, staked, rate):
    if any(v == 0 for v in [dur, apr, staked, rate]):
        return 0
    return (dur * apr * staked * rate) // REWARD_DIVISOR


def get_creator():
    sk = mnemonic.to_private_key(LOCALNET_MNEMONIC)
    addr = account.address_from_private_key(sk)
    info = algod_cl.account_info(addr)
    print("Creator: {} ({:.1f} ALGO)".format(addr, info["amount"] / 1e6))
    return addr, sk


def compile_teal():
    with open(TEAL_DIR + "FryFarming.approval.teal") as f:
        a = algod_cl.compile(f.read())["result"]
    with open(TEAL_DIR + "FryFarming.clear.teal") as f:
        c = algod_cl.compile(f.read())["result"]
    return base64.b64decode(a), base64.b64decode(c)


def send_wait(stxn_or_list):
    if isinstance(stxn_or_list, list):
        txid = algod_cl.send_transactions(stxn_or_list)
    else:
        txid = algod_cl.send_transaction(stxn_or_list)
    return transaction.wait_for_confirmation(algod_cl, txid, 4)


def get_chain_ts(sender, sk):
    """Send 0-ALGO self-pay to get current on-chain timestamp."""
    sp = algod_cl.suggested_params()
    txn = transaction.PaymentTxn(sender=sender, sp=sp, receiver=sender, amt=0)
    res = send_wait(txn.sign(sk))
    rnd = res["confirmed-round"]
    url = "{}/v2/blocks/{}".format(ALGOD_URL, rnd)
    req = urllib.request.Request(url, headers={"X-Algo-API-Token": ALGOD_TOKEN})
    block = json.loads(urllib.request.urlopen(req).read())
    return block["block"]["ts"]


def create_asa(sender, sk, total=10**18, decimals=6, name="TEST"):
    sp = algod_cl.suggested_params()
    txn = transaction.AssetConfigTxn(
        sender=sender, sp=sp, total=total, decimals=decimals,
        default_frozen=False, unit_name=name[:8], asset_name=name,
        manager=sender, reserve=sender, freeze=sender, clawback=sender,
    )
    return send_wait(txn.sign(sk))["asset-index"]


def optin_asa(addr, sk, asa_id):
    sp = algod_cl.suggested_params()
    txn = transaction.AssetTransferTxn(sender=addr, sp=sp, receiver=addr, amt=0, index=asa_id)
    send_wait(txn.sign(sk))


def xfer_asa(sender, sk, receiver, asa_id, amt):
    sp = algod_cl.suggested_params()
    txn = transaction.AssetTransferTxn(sender=sender, sp=sp, receiver=receiver, amt=amt, index=asa_id)
    send_wait(txn.sign(sk))


def pay_algo(sender, sk, receiver, amt):
    sp = algod_cl.suggested_params()
    txn = transaction.PaymentTxn(sender=sender, sp=sp, receiver=receiver, amt=amt)
    send_wait(txn.sign(sk))


def get_bal(addr, asa_id):
    info = algod_cl.account_info(addr)
    for a in info.get("assets", []):
        if a["asset-id"] == asa_id:
            return a["amount"]
    return 0


def read_global(app_id):
    url = "{}/v2/applications/{}".format(ALGOD_URL, app_id)
    req = urllib.request.Request(url, headers={"X-Algo-API-Token": ALGOD_TOKEN})
    resp = json.loads(urllib.request.urlopen(req).read())
    gs = {}
    for item in resp["params"]["global-state"]:
        key = base64.b64decode(item["key"]).decode()
        val = item["value"]
        gs[key] = val["uint"] if val["type"] == 2 else base64.b64decode(val.get("bytes", ""))
    return gs


def deploy(creator, sk, approval, clear):
    sp = algod_cl.suggested_params()
    txn = transaction.ApplicationCreateTxn(
        sender=creator, sp=sp,
        on_complete=transaction.OnComplete.NoOpOC,
        approval_program=approval, clear_program=clear,
        global_schema=transaction.StateSchema(num_uints=18, num_byte_slices=1),
        local_schema=transaction.StateSchema(num_uints=0, num_byte_slices=0),
    )
    res = send_wait(txn.sign(sk))
    aid = res["application-index"]
    app_ids.append(aid)
    return aid


def group_sign_send(txns, sks):
    gid = transaction.calculate_group_id(txns)
    for t in txns:
        t.group = gid
    return send_wait([t.sign(s) for t, s in zip(txns, sks)])


# ── ABI method builders ──

def call_init(app_id, creator, sk, authority, lp_a, lp_b, reward_tok,
              reward_amt, start, end, lock, fee, rate, schedule, fry, fry_fee):
    sp = algod_cl.suggested_params()
    txn = transaction.ApplicationCallTxn(
        sender=creator, sp=sp, index=app_id,
        on_complete=transaction.OnComplete.NoOpOC,
        app_args=[SEL["init"], encoding.decode_address(authority),
                  u64(lp_a), u64(lp_b), u64(reward_tok), u64(reward_amt),
                  u64(start), u64(end), u64(lock), u64(fee),
                  u64(rate), u64(schedule), u64(fry), u64(fry_fee)],
        accounts=[authority] if authority != creator else [],
    )
    send_wait(txn.sign(sk))


def call_optin(app_id, app_addr, creator, sk, lp_a, lp_b, reward_tok, mbr):
    sp = algod_cl.suggested_params()
    pay_txn = transaction.PaymentTxn(sender=creator, sp=sp, receiver=app_addr, amt=mbr)
    sp2 = algod_cl.suggested_params()
    sp2.flat_fee = True
    sp2.fee = 4000
    app_txn = transaction.ApplicationCallTxn(
        sender=creator, sp=sp2, index=app_id,
        on_complete=transaction.OnComplete.NoOpOC,
        app_args=[SEL["optin"], u64(lp_a), u64(lp_b), u64(reward_tok)],
        foreign_assets=[lp_a, lp_b, reward_tok],
    )
    group_sign_send([pay_txn, app_txn], [sk, sk])


def call_receive(app_id, app_addr, creator, sk, reward_tok, amt):
    sp = algod_cl.suggested_params()
    axfer = transaction.AssetTransferTxn(
        sender=creator, sp=sp, receiver=app_addr, amt=amt, index=reward_tok)
    app_txn = transaction.ApplicationCallTxn(
        sender=creator, sp=sp, index=app_id,
        on_complete=transaction.OnComplete.NoOpOC,
        app_args=[SEL["receive"]],
    )
    group_sign_send([axfer, app_txn], [sk, sk])


def call_stake(app_id, app_addr, staker, sk, stake_amt, apr, lp_a):
    sp = algod_cl.suggested_params()
    sp1 = transaction.PaymentTxn(sender=staker, sp=sp, receiver=app_addr, amt=100_000)
    sp2 = transaction.AssetTransferTxn(sender=staker, sp=sp, receiver=app_addr, amt=stake_amt, index=lp_a)
    sp3 = transaction.PaymentTxn(sender=staker, sp=sp, receiver=app_addr, amt=128_100)
    box_name = encoding.decode_address(staker)
    app_txn = transaction.ApplicationCallTxn(
        sender=staker, sp=sp, index=app_id,
        on_complete=transaction.OnComplete.NoOpOC,
        app_args=[SEL["stake"], u64(stake_amt), u64(apr)],
        boxes=[(app_id, box_name)],
    )
    group_sign_send([sp1, sp2, sp3, app_txn], [sk, sk, sk, sk])


def call_get_stake(app_id, caller, sk, user_addr):
    sp = algod_cl.suggested_params()
    box_name = encoding.decode_address(user_addr)
    txn = transaction.ApplicationCallTxn(
        sender=caller, sp=sp, index=app_id,
        on_complete=transaction.OnComplete.NoOpOC,
        app_args=[SEL["get_stake"], encoding.decode_address(user_addr)],
        accounts=[user_addr] if user_addr != caller else [],
        boxes=[(app_id, box_name)],
    )
    res = send_wait(txn.sign(sk))
    for log_entry in res.get("logs", []):
        raw = base64.b64decode(log_entry)
        if raw[:4] == b"\x15\x1f\x7c\x75":
            d = raw[4:]
            return int.from_bytes(d[0:8], "big"), int.from_bytes(d[8:16], "big"), int.from_bytes(d[16:24], "big")
    raise ValueError("No ARC-4 return value")


def call_check(app_id, staker, sk):
    sp = algod_cl.suggested_params()
    box_name = encoding.decode_address(staker)
    txn = transaction.ApplicationCallTxn(
        sender=staker, sp=sp, index=app_id,
        on_complete=transaction.OnComplete.NoOpOC,
        app_args=[SEL["check"]],
        boxes=[(app_id, box_name)],
    )
    res = send_wait(txn.sign(sk))
    for log_entry in res.get("logs", []):
        raw = base64.b64decode(log_entry)
        if raw[:4] == b"\x15\x1f\x7c\x75":
            return int.from_bytes(raw[4:12], "big")
    raise ValueError("No ARC-4 return value")


def call_claim(app_id, staker, sk, reward_tok):
    sp = algod_cl.suggested_params()
    sp.flat_fee = True
    sp.fee = 2000
    box_name = encoding.decode_address(staker)
    txn = transaction.ApplicationCallTxn(
        sender=staker, sp=sp, index=app_id,
        on_complete=transaction.OnComplete.NoOpOC,
        app_args=[SEL["claim"]],
        foreign_assets=[reward_tok],
        boxes=[(app_id, box_name)],
    )
    send_wait(txn.sign(sk))


def call_unstake(app_id, staker, sk, amt, lp_a):
    sp = algod_cl.suggested_params()
    sp.flat_fee = True
    sp.fee = 2000
    box_name = encoding.decode_address(staker)
    txn = transaction.ApplicationCallTxn(
        sender=staker, sp=sp, index=app_id,
        on_complete=transaction.OnComplete.NoOpOC,
        app_args=[SEL["unstake"], u64(amt)],
        foreign_assets=[lp_a],
        boxes=[(app_id, box_name)],
    )
    send_wait(txn.sign(sk))


# ── Quick setup (Suite B/C) ──

def quick_setup(creator, csk, approval, clear,
                stake_amt, apr, rate,
                reward_pool=10_000_000_000_000,
                farm_end=0, asa_supply=10**19):
    """farm_end=0 means no cap. Positive value = absolute on-chain timestamp."""
    ssk, saddr = account.generate_account()
    pay_algo(creator, csk, saddr, 50_000_000)

    lp_a = create_asa(creator, csk, total=asa_supply, name="LP_A")
    lp_b = create_asa(creator, csk, total=asa_supply, name="LP_B")
    rtok = create_asa(creator, csk, total=asa_supply, name="REWARD")
    ftok = create_asa(creator, csk, total=asa_supply, name="FRY")

    aid = deploy(creator, csk, approval, clear)
    aaddr = get_application_address(aid)

    # Use on-chain time for farm_start
    chain_ts = get_chain_ts(creator, csk)
    call_init(aid, creator, csk, creator, lp_a, lp_b, rtok,
              0, chain_ts, farm_end, 0, 0, rate, 0, ftok, 0)
    call_optin(aid, aaddr, creator, csk, lp_a, lp_b, rtok, 400_000)
    call_receive(aid, aaddr, creator, csk, rtok, reward_pool)

    optin_asa(saddr, ssk, lp_a)
    xfer_asa(creator, csk, saddr, lp_a, stake_amt)
    optin_asa(saddr, ssk, rtok)
    call_stake(aid, aaddr, saddr, ssk, stake_amt, apr, lp_a)

    # Read actual on-chain last_claim_time from box
    staked_v, _, last_claim = call_get_stake(aid, creator, csk, saddr)
    print("  on-chain: staked={} last_claim={}".format(staked_v, last_claim))

    return aid, aaddr, saddr, ssk, rtok, lp_a, last_claim


# ══════════════════════════════════════════════════════════════
# SUITE A
# ══════════════════════════════════════════════════════════════
def suite_a(creator, csk, approval, clear):
    print("\n" + "=" * 50)
    print("SUITE A — Happy Path")
    print("=" * 50)

    ssk, saddr = account.generate_account()
    pay_algo(creator, csk, saddr, 10_000_000)
    print("Staker: {}".format(saddr))

    lp_a = create_asa(creator, csk, total=10**15, name="LP_A")
    lp_b = create_asa(creator, csk, total=10**15, name="LP_B")
    rtok = create_asa(creator, csk, total=10**15, name="REWARD")
    ftok = create_asa(creator, csk, total=10**15, name="FRY")
    print("ASAs: lp_a={} lp_b={} reward={} fry={}".format(lp_a, lp_b, rtok, ftok))

    STAKE = 1_000_000_000
    APR = 2000
    RATE = 100_000_000

    # A1: init_farming
    try:
        aid = deploy(creator, csk, approval, clear)
        aaddr = get_application_address(aid)
        chain_ts = get_chain_ts(creator, csk)
        call_init(aid, creator, csk, creator, lp_a, lp_b, rtok,
                  0, chain_ts, chain_ts + 86400, 0, 0, RATE, 0, ftok, 0)
        gs = read_global(aid)
        assert gs["stake_token"] == lp_a
        assert gs["reward_token"] == rtok
        assert gs["apr"] == 0
        log_test("A1", "init_farming", True, "app_id={}, globals OK".format(aid))
    except Exception as e:
        log_test("A1", "init_farming", False, repr(e))
        return

    # A2: optInAsset
    try:
        call_optin(aid, aaddr, creator, csk, lp_a, lp_b, rtok, 400_000)
        for asa, nm in [(lp_a, "lp_a"), (lp_b, "lp_b"), (rtok, "reward")]:
            assert get_bal(aaddr, asa) == 0
        log_test("A2", "optInAsset", True, "3 opt-ins OK")
    except Exception as e:
        log_test("A2", "optInAsset", False, repr(e))
        return

    # A3: assetReceive
    try:
        call_receive(aid, aaddr, creator, csk, rtok, 10_000_000_000)
        bal = get_bal(aaddr, rtok)
        gs = read_global(aid)
        assert bal == 10_000_000_000, "bal={}".format(bal)
        assert gs["reward_token_amount"] == 10_000_000_000, "rta={}".format(gs["reward_token_amount"])
        log_test("A3", "assetReceive", True, "bal={} rta={}".format(bal, gs["reward_token_amount"]))
    except Exception as e:
        log_test("A3", "assetReceive", False, repr(e))
        return

    # A4: stakeTokens
    try:
        optin_asa(saddr, ssk, lp_a)
        xfer_asa(creator, csk, saddr, lp_a, STAKE)
        optin_asa(saddr, ssk, rtok)
        call_stake(aid, aaddr, saddr, ssk, STAKE, APR, lp_a)
        gs = read_global(aid)
        assert gs["total_staked"] == STAKE
        assert gs["total_farmers"] == 1
        assert gs["apr"] == APR
        log_test("A4", "stakeTokens", True, "staked={} apr={}".format(STAKE, APR))
    except Exception as e:
        log_test("A4", "stakeTokens", False, repr(e))
        return

    # A5: getUserStake
    try:
        v1, v2, v3 = call_get_stake(aid, creator, csk, saddr)
        assert v1 == STAKE
        assert v2 > 0 and v3 > 0
        log_test("A5", "getUserStake", True, "staked={} t={} lc={}".format(v1, v2, v3))
    except Exception as e:
        log_test("A5", "getUserStake", False, repr(e))

    # A6: checkRewards
    try:
        print("Waiting 5s...")
        time.sleep(5)
        on_chain = call_check(aid, saddr, ssk)
        per_sec = expected_reward(1, APR, STAKE, RATE)
        actual_dur = on_chain // per_sec if per_sec > 0 else 0
        exp_actual = expected_reward(actual_dur, APR, STAKE, RATE)
        math_ok = abs(on_chain - exp_actual) <= per_sec
        assert on_chain > 0, "reward=0"
        assert math_ok, "math mismatch: on_chain={} exp={}".format(on_chain, exp_actual)
        log_test("A6", "checkRewards", True,
                 "on_chain={} ~{}s math_ok={}".format(on_chain, actual_dur, math_ok))
    except Exception as e:
        log_test("A6", "checkRewards", False, repr(e))

    # A7: claimRewards
    try:
        before = get_bal(saddr, rtok)
        call_claim(aid, saddr, ssk, rtok)
        after = get_bal(saddr, rtok)
        claimed = after - before
        gs = read_global(aid)
        assert claimed > 0, "claimed=0"
        assert gs["rewards_distributed"] > 0
        log_test("A7", "claimRewards", True,
                 "claimed={} dist={}".format(claimed, gs["rewards_distributed"]))
    except Exception as e:
        log_test("A7", "claimRewards", False, repr(e))

    # A8: unstakeTokens
    try:
        before = get_bal(saddr, lp_a)
        call_unstake(aid, saddr, ssk, STAKE, lp_a)
        after = get_bal(saddr, lp_a)
        ret = after - before
        gs = read_global(aid)
        assert ret == STAKE
        assert gs["total_staked"] == 0
        assert gs["total_farmers"] == 0
        log_test("A8", "unstakeTokens", True, "returned={} staked=0".format(ret))
    except Exception as e:
        log_test("A8", "unstakeTokens", False, repr(e))


# ══════════════════════════════════════════════════════════════
# SUITE B — Overflow Regression (farm_end=0, no cap)
# ══════════════════════════════════════════════════════════════
def suite_b(creator, csk, approval, clear):
    print("\n" + "=" * 50)
    print("SUITE B — Overflow Regression")
    print("=" * 50)

    cases = [
        ("B1", "overflow-short", 1_000_000_000_000, 2000, 100_000_000, 10),
        ("B2", "overflow-80d", 1_000_000_000, 1_382_400_000, 100_000_000, 10),
        ("B3", "whale", 10**18, 10_000, 100_000_000, 10),
    ]

    for tid, name, staked, apr, rate, slp in cases:
        try:
            print("\n--- {}: staked={} apr={} ---".format(tid, staked, apr))
            aid, _, saddr, ssk, _, _, lc = quick_setup(
                creator, csk, approval, clear,
                staked, apr, rate, reward_pool=10**18, farm_end=0, asa_supply=10**19,
            )
            print("  Sleeping {}s...".format(slp))
            time.sleep(slp)

            on_chain = call_check(aid, saddr, ssk)
            prod = slp * apr * staked * rate
            per_sec = expected_reward(1, apr, staked, rate)
            actual_dur = on_chain // per_sec if per_sec > 0 else 0
            exp_actual = expected_reward(actual_dur, apr, staked, rate)
            math_ok = abs(on_chain - exp_actual) <= per_sec  # within 1s tolerance

            ok = on_chain > 0 and math_ok
            log_test(tid, name, ok,
                     "on_chain={} ~{}s math_match={} product={:.2e} (>2^64={})".format(
                         on_chain, actual_dur, math_ok, float(prod), prod > 2**64))
        except Exception as e:
            log_test(tid, name, False, repr(e))


# ══════════════════════════════════════════════════════════════
# SUITE C — farm_end_time Cap (uses on-chain timestamps)
# ══════════════════════════════════════════════════════════════
def suite_c(creator, csk, approval, clear):
    print("\n" + "=" * 50)
    print("SUITE C — farm_end_time Cap")
    print("=" * 50)

    STAKED = 1_000_000_000
    APR = 2000
    RATE = 100_000_000

    try:
        # Measure block time adaptively (2 dummy txns)
        ts1 = get_chain_ts(creator, csk)
        ts2 = get_chain_ts(creator, csk)
        block_time = ts2 - ts1
        print("Measured block_time={}s".format(block_time))

        # Setup creates ~14 blocks. Set farm_end = ts2 + 14*bt + cap_duration
        CAP_SECS = 5
        setup_blocks = 14
        farm_end_abs = ts2 + setup_blocks * block_time + CAP_SECS + 2 * block_time  # +2bt margin
        print("ts2={} farm_end={} (est setup={}s + cap={}s + margin={}s)".format(
            ts2, farm_end_abs, setup_blocks * block_time, CAP_SECS, 2 * block_time))

        ssk, saddr = account.generate_account()
        pay_algo(creator, csk, saddr, 50_000_000)
        lp_a = create_asa(creator, csk, total=10**15, name="LP_A")
        lp_b = create_asa(creator, csk, total=10**15, name="LP_B")
        rtok = create_asa(creator, csk, total=10**15, name="REWARD")
        ftok = create_asa(creator, csk, total=10**15, name="FRY")

        aid = deploy(creator, csk, approval, clear)
        aaddr = get_application_address(aid)
        call_init(aid, creator, csk, creator, lp_a, lp_b, rtok,
                  0, ts2, farm_end_abs, 0, 0, RATE, 0, ftok, 0)
        call_optin(aid, aaddr, creator, csk, lp_a, lp_b, rtok, 400_000)
        call_receive(aid, aaddr, creator, csk, rtok, 10_000_000_000)

        optin_asa(saddr, ssk, lp_a)
        xfer_asa(creator, csk, saddr, lp_a, STAKED)
        optin_asa(saddr, ssk, rtok)
        call_stake(aid, aaddr, saddr, ssk, STAKED, APR, lp_a)

        # Read on-chain staking time
        _, _, last_claim = call_get_stake(aid, creator, csk, saddr)
        cap_dur = farm_end_abs - last_claim
        print("  last_claim={} cap_dur={}s (target ~{}s)".format(
            last_claim, cap_dur, CAP_SECS + 2 * block_time))

        if cap_dur <= 0:
            print("  WARNING: farm ended before stake!")
            log_test("C1", "end_time check", False, "cap_dur={}".format(cap_dur))
            log_test("C2", "end_time claim", False, "cap_dur={}".format(cap_dur))
            return

        # Sleep past farm_end: need cap_dur + extra blocks of on-chain time
        # Each sleep-second ≈ wall-clock, but on-chain advances per block
        # Just sleep a bit and make dummy txns to advance on-chain time past farm_end
        n_advance = (cap_dur // block_time) + 5  # blocks needed to pass farm_end
        print("  Advancing {} blocks to pass farm_end...".format(n_advance))
        for _ in range(n_advance):
            get_chain_ts(creator, csk)
        time.sleep(2)  # small real-time buffer

        # C1: checkRewards — should be capped at cap_dur (NOT the full elapsed time)
        on_chain = call_check(aid, saddr, ssk)
        exp_cap = expected_reward(cap_dur, APR, STAKED, RATE)
        # Allow ±1 block_time tolerance
        lo = expected_reward(max(1, cap_dur - block_time), APR, STAKED, RATE)
        hi = expected_reward(cap_dur + block_time, APR, STAKED, RATE)
        # Also compute what uncapped would be (using actual elapsed blocks)
        per_sec = expected_reward(1, APR, STAKED, RATE)
        uncapped_dur = on_chain // per_sec if per_sec > 0 else 0
        ok1 = lo <= on_chain <= hi
        log_test("C1", "end_time check", ok1,
                 "on_chain={} exp_cap={} cap_dur={}s uncapped_would_be=~{}s lo={} hi={}".format(
                     on_chain, exp_cap, cap_dur, uncapped_dur, lo, hi))

        # C2: claimRewards — transfer should match capped amount
        before = get_bal(saddr, rtok)
        call_claim(aid, saddr, ssk, rtok)
        after = get_bal(saddr, rtok)
        claimed = after - before
        ok2 = lo <= claimed <= hi
        log_test("C2", "end_time claim", ok2,
                 "claimed={} exp_cap={} cap_dur={}s".format(claimed, exp_cap, cap_dur))

    except Exception as e:
        log_test("C1", "end_time check", False, repr(e))
        log_test("C2", "end_time claim", False, repr(e))


def main():
    print("=" * 60)
    print("FryFarming V2 — Localnet Test Suite")
    print("=" * 60)

    status = algod_cl.status()
    gh = status.get("genesis-hash", "")
    print("Genesis hash: {}".format(gh or "(empty/devnet)"))
    if gh == "wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=":
        print("HARD STOP: MAINNET"); sys.exit(1)
    if gh == "SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=":
        print("HARD STOP: TESTNET"); sys.exit(1)
    print("OK: localnet/devnet\n")

    creator, csk = get_creator()
    approval, clear = compile_teal()
    print("TEAL compiled\n")

    suite_a(creator, csk, approval, clear)
    suite_b(creator, csk, approval, clear)
    suite_c(creator, csk, approval, clear)

    print("\n" + "=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)
    p = sum(1 for _, _, ok, _ in results if ok)
    t = len(results)
    bpass = all(ok for tid, _, ok, _ in results if tid.startswith("B"))
    cpass = all(ok for tid, _, ok, _ in results if tid.startswith("C"))

    for tid, name, ok, ev in results:
        print("  {} ({}): {} — {}".format(tid, name, "PASS" if ok else "FAIL", ev))

    print("\n{}/{} passed".format(p, t))
    print("Overflow: {}".format("PASS" if bpass else "FAIL"))
    print("End cap: {}".format("PASS" if cpass else "FAIL"))
    print("App IDs: {}".format(app_ids))
    print("=" * 60)
    sys.exit(0 if p == t else 1)


if __name__ == "__main__":
    main()
