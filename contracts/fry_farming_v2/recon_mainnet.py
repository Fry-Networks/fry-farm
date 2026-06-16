#!/usr/bin/env python3
"""FryFarming V2 — Mainnet Recon
Read-only: queries AlgoNode public API, zero writes to chain.
Enumerates both old farming pools, all staker positions, computes owed rewards.
"""

import struct
import time
import json
import base64
import sys
from datetime import datetime, timezone
from algosdk.v2client.algod import AlgodClient
from algosdk import encoding

ALGOD_URL = "https://mainnet-api.algonode.cloud"
ALGOD_TOKEN = ""
POOL_1 = 3470331118
POOL_2 = 3470332962
DEPLOYER = "E2F2LT2INE75DBOYHQXTCTOP2PAP5MHAXQRXTTCCXFKHQTVG36DJONBQZE"
DIVISOR = 3_110_400_000_000_000
UINT64_MAX = 2**64 - 1

client = AlgodClient(ALGOD_TOKEN, ALGOD_URL)


def ts_to_iso(ts):
    if ts == 0:
        return "N/A"
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def ts_to_days_ago(ts):
    if ts == 0:
        return 0
    return (int(time.time()) - ts) / 86400


def read_global_state(app_id):
    """Read all global state keys for an application."""
    info = client.application_info(app_id)
    gs = {}
    for item in info["params"]["global-state"]:
        key = base64.b64decode(item["key"]).decode("utf-8", errors="replace")
        val = item["value"]
        if val["type"] == 2:  # uint
            gs[key] = val["uint"]
        else:  # bytes
            raw = base64.b64decode(val.get("bytes", ""))
            if len(raw) == 32:
                gs[key] = encoding.encode_address(raw)
            else:
                gs[key] = raw.hex()
    return gs


def read_staker_boxes(app_id):
    """Enumerate all boxes, decode staker data."""
    stakers = []
    try:
        boxes_resp = client.application_boxes(app_id)
        for box_desc in boxes_resp.get("boxes", []):
            box_name_b64 = box_desc["name"]
            box_name_bytes = base64.b64decode(box_name_b64)

            if len(box_name_bytes) != 32:
                print("  SKIP non-32-byte box: {} bytes".format(len(box_name_bytes)))
                continue

            addr = encoding.encode_address(box_name_bytes)
            box_data = client.application_box_by_name(app_id, box_name_bytes)
            raw = base64.b64decode(box_data["value"])

            if len(raw) != 32:
                print("  SKIP box for {} — {} bytes (expected 32)".format(addr, len(raw)))
                continue

            staked, stake_time, reserved, last_claim = struct.unpack(">QQQQ", raw)
            stakers.append({
                "address": addr,
                "staked": staked,
                "stake_time": stake_time,
                "reserved": reserved,
                "last_claim": last_claim,
            })
    except Exception as e:
        print("  ERROR reading boxes for app {}: {}".format(app_id, e))
    return stakers


def compute_owed(staked, stake_time, last_claim, apr, rate, farm_end):
    """Python big-int reward calculation — matches V2 BigUInt formula.
    Falls back to stake_time if last_claim is 0 (staker never claimed)."""
    now = int(time.time())
    effective_end = min(now, farm_end) if farm_end > 0 else now
    # Use last_claim if set, otherwise stake_time (staker never claimed)
    claim_start = last_claim if last_claim > 0 else stake_time
    if claim_start == 0:
        return 0, 0, 0, False
    duration = max(0, effective_end - claim_start)
    if staked == 0 or apr == 0 or rate == 0 or duration == 0:
        return 0, 0, 0, False
    reward = (duration * apr * staked * rate) // DIVISOR
    product = duration * apr * staked * rate
    return reward, duration, product, product > UINT64_MAX


def print_global_table(gs, pool_name):
    print("\n  {:.<40s} {}".format("authority", gs.get("authority", "?")))
    uint_keys = [
        "apr", "stake_token", "reward_token", "reward_token_amount",
        "rewards_distributed", "total_staked", "total_stakers", "total_farmers",
        "farm_start_time", "farm_end_time", "lock_period",
        "reward_distribution_rate", "reward_distribution_schedule",
        "lp_token_a", "lp_token_b", "fry_token", "fry_reward_fee", "created_At",
    ]
    for k in uint_keys:
        v = gs.get(k, "?")
        extra = ""
        if k in ("farm_start_time", "farm_end_time", "created_At") and isinstance(v, int) and v > 0:
            extra = "  ({})".format(ts_to_iso(v))
        elif k == "lock_period" and isinstance(v, int) and v > 0:
            extra = "  ({:.1f} days)".format(v / 86400)
        print("  {:.<40s} {}{}".format(k, v, extra))


def print_staker_table(stakers, apr, rate, farm_end, pool_label):
    total_staked = 0
    total_owed = 0
    print("\n  {:<15s} {:>15s} {:>22s} {:>12s} {:>12s} {:>15s} {:>6s}".format(
        "Address", "Staked", "Stake Time", "Resv(16:24)", "LClaim(24:32)", "Owed Reward", "Oflow"))
    print("  " + "-" * 110)

    for s in sorted(stakers, key=lambda x: x["staked"], reverse=True):
        addr_short = s["address"][:8] + "..." + s["address"][-4:]
        owed, dur, product, overflows = compute_owed(
            s["staked"], s["stake_time"], s["last_claim"], apr, rate, farm_end)
        total_staked += s["staked"]
        total_owed += owed
        dur_days = dur / 86400

        # Show reserved and last_claim as raw ints to detect layout issues
        resv = s["reserved"]
        lc = s["last_claim"]
        resv_str = str(resv) if resv == 0 else ts_to_iso(resv)[:10]
        lc_str = str(lc) if lc == 0 else ts_to_iso(lc)[:10]

        print("  {:<15s} {:>15,d} {:>22s} {:>12s} {:>12s} {:>15,d} {:>6s}".format(
            addr_short, s["staked"],
            ts_to_iso(s["stake_time"]),
            resv_str, lc_str,
            owed, "YES" if overflows else "no",
        ))
        print("    full: {} | dur={:.1f}d | product={:.2e}".format(
            s["address"], dur_days, float(product)))

    print("  " + "-" * 105)
    print("  SUBTOTAL: staked={:,d}  owed_rewards={:,d}  stakers={}".format(
        total_staked, total_owed, len(stakers)))
    return total_staked, total_owed


def main():
    now = int(time.time())
    print("=" * 70)
    print("MAINNET RECON: FryFarming V2 Deploy")
    print("Timestamp: {} ({})".format(now, ts_to_iso(now)))
    print("=" * 70)

    grand_staked = 0
    grand_owed = 0
    all_overflow = True
    pool_data = {}

    for pool_id, pool_label in [(POOL_1, "Pool 1"), (POOL_2, "Pool 2")]:
        print("\n" + "=" * 70)
        print("--- {}: App {} ---".format(pool_label, pool_id))
        print("=" * 70)

        gs = read_global_state(pool_id)
        print_global_table(gs, pool_label)

        apr = gs.get("apr", 0)
        rate = gs.get("reward_distribution_rate", 0)
        farm_end = gs.get("farm_end_time", 0)
        farm_start = gs.get("farm_start_time", 0)
        lock = gs.get("lock_period", 0)

        print("\n  Staker Boxes:")
        stakers = read_staker_boxes(pool_id)
        if not stakers:
            print("  (no staker boxes found)")
            continue

        sub_staked, sub_owed = print_staker_table(stakers, apr, rate, farm_end, pool_label)
        grand_staked += sub_staked
        grand_owed += sub_owed

        # Check if all stakers overflow
        for s in stakers:
            _, _, product, overflows = compute_owed(s["staked"], s["stake_time"], s["last_claim"], apr, rate, farm_end)
            if not overflows:
                all_overflow = False

        # Lock expiry
        if farm_start > 0 and lock > 0:
            lock_end = farm_start + lock
            print("\n  Lock expiry: {} (farm_start + lock_period)".format(ts_to_iso(lock_end)))
            if lock_end > now:
                print("  Lock still active — {:.1f} days remaining".format((lock_end - now) / 86400))
            else:
                print("  Lock EXPIRED — stakers can unstake")
        else:
            print("\n  No lock period set")

        pool_data[pool_label] = {
            "app_id": pool_id,
            "gs": gs,
            "stakers": stakers,
            "sub_staked": sub_staked,
            "sub_owed": sub_owed,
        }

    # ── Deployer Account ──
    print("\n" + "=" * 70)
    print("--- Deployer Account: {} ---".format(DEPLOYER))
    print("=" * 70)
    try:
        acct = client.account_info(DEPLOYER)
        algo_bal = acct["amount"]
        min_bal = acct.get("min-balance", 0)
        avail = algo_bal - min_bal
        print("  ALGO balance:    {:>15,.6f}".format(algo_bal / 1_000_000))
        print("  Min balance:     {:>15,.6f}".format(min_bal / 1_000_000))
        print("  Available ALGO:  {:>15,.6f}".format(avail / 1_000_000))

        print("\n  Opted-in ASAs:")
        for asset in acct.get("assets", []):
            print("    ASA {:>12d}: {:>20,d}".format(asset["asset-id"], asset["amount"]))
    except Exception as e:
        print("  ERROR reading deployer account: {}".format(e))

    # ── Reward Token Analysis ──
    print("\n" + "=" * 70)
    print("--- Reward Token Analysis ---")
    print("=" * 70)
    # Get reward token ID from first pool
    reward_token_id = None
    for pl in pool_data.values():
        rt = pl["gs"].get("reward_token", 0)
        if isinstance(rt, int) and rt > 0:
            reward_token_id = rt
            break

    if reward_token_id:
        print("  Reward token ASA: {}".format(reward_token_id))
        try:
            asset_info = client.asset_info(reward_token_id)
            params = asset_info.get("params", {})
            print("  Name: {} ({})".format(params.get("name", "?"), params.get("unit-name", "?")))
            print("  Total supply: {:,d}".format(params.get("total", 0)))
            print("  Decimals: {}".format(params.get("decimals", 0)))
            print("  Creator: {}".format(params.get("creator", "?")))
        except Exception as e:
            print("  ERROR reading asset info: {}".format(e))

        # Deployer's balance of reward token
        deployer_rt_bal = 0
        try:
            acct = client.account_info(DEPLOYER)
            for asset in acct.get("assets", []):
                if asset["asset-id"] == reward_token_id:
                    deployer_rt_bal = asset["amount"]
                    break
        except:
            pass
        print("  Deployer reward token balance: {:,d}".format(deployer_rt_bal))
        print("  Total owed rewards: {:,d}".format(grand_owed))
        sufficient = deployer_rt_bal >= grand_owed
        print("  Deployer has enough: {} ({:+,d})".format(
            "YES" if sufficient else "NO",
            deployer_rt_bal - grand_owed))

    # ── Token ASA IDs ──
    print("\n" + "=" * 70)
    print("--- Token ASA IDs (from old pools) ---")
    print("=" * 70)
    for pl_name, pl in pool_data.items():
        gs = pl["gs"]
        print("  {} (App {}):".format(pl_name, pl["app_id"]))
        for k in ["stake_token", "lp_token_a", "lp_token_b", "reward_token", "fry_token"]:
            print("    {}: {}".format(k, gs.get(k, "?")))

    # ── Deploy Cost Estimate ──
    print("\n" + "=" * 70)
    print("--- Deploy Cost Estimate ---")
    print("=" * 70)
    # App create: 100_000 microALGO MBR base + schema MBR
    # Schema: 18 uint (28,500 each) + 1 bytes (50,000 each) = 513,000 + 50,000 = 563,000
    schema_mbr = 100_000 + 18 * 28_500 + 1 * 50_000
    # Per-box MBR: 2500 + 400 * (32 + 32) = 28,100 per staker
    box_mbr_per_staker = 2500 + 400 * 64
    total_box_mbr = box_mbr_per_staker * 13
    # Txn fees (create + init + optin[group] + assetReceive[group] + 13 stakeTokens[group of 4])
    txn_fees = 1000 + 1000 + 2000 + 2000 + 13 * 4000  # rough
    # Asset opt-in MBR (3 assets × 100,000)
    asset_optin_mbr = 3 * 100_000
    total_cost = schema_mbr + total_box_mbr + txn_fees + asset_optin_mbr

    print("  App MBR (18 uint + 1 bytes): {:>10,d} microALGO ({:.4f} ALGO)".format(
        schema_mbr, schema_mbr / 1_000_000))
    print("  Box MBR (13 stakers × {}): {:>10,d} microALGO ({:.4f} ALGO)".format(
        box_mbr_per_staker, total_box_mbr, total_box_mbr / 1_000_000))
    print("  Asset opt-in MBR (3 × 100k): {:>10,d} microALGO ({:.4f} ALGO)".format(
        asset_optin_mbr, asset_optin_mbr / 1_000_000))
    print("  Est. txn fees:               {:>10,d} microALGO ({:.4f} ALGO)".format(
        txn_fees, txn_fees / 1_000_000))
    print("  ────────────────────────────────────────────")
    print("  TOTAL ESTIMATE:              {:>10,d} microALGO ({:.4f} ALGO)".format(
        total_cost, total_cost / 1_000_000))

    try:
        avail_algo = client.account_info(DEPLOYER)["amount"] - client.account_info(DEPLOYER).get("min-balance", 0)
        print("  Deployer available ALGO:     {:>10,d} microALGO ({:.4f} ALGO)".format(
            avail_algo, avail_algo / 1_000_000))
        print("  Sufficient: {}".format("YES" if avail_algo >= total_cost else "NO"))
    except:
        pass

    # ── Grand Summary ──
    print("\n" + "=" * 70)
    print("--- Grand Summary ---")
    print("=" * 70)
    total_staker_count = sum(len(pl["stakers"]) for pl in pool_data.values())
    print("  Total stakers: {}".format(total_staker_count))
    print("  Total principal staked: {:,d}".format(grand_staked))
    print("  Total owed rewards: {:,d}".format(grand_owed))
    print("  All stakers overflow uint64: {}".format("YES" if all_overflow else "NO"))
    print("=" * 70)


if __name__ == "__main__":
    main()
