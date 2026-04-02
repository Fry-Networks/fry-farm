from algopy import (
    ARC4Contract,
    Account,
    Asset,
    Bytes,
    Box,
    Global,
    Txn,
    UInt64,
    arc4,
    gtxn,
    itxn,
    op,
    subroutine,
)

SECONDS_PER_YEAR = 31104000  # 360 * 86400
BOX_SIZE = 32  # 4 fields * 8 bytes
DEFAULT_TOKEN = 735549981  # FRY token ASA ID (sentinel for 0)


class FryStaking(ARC4Contract):
    """FryStaking V2 — fixes reward formula with 128-bit math."""

    # ── Create ───────────────────────────────────────────────────────────

    @arc4.abimethod(create="require")
    def init_staking(
        self,
        _authority: Account,
        _stake_token: UInt64,
        _reward_token: UInt64,
        _reward_token_amount: UInt64,
        _stake_start_time: UInt64,
        _stake_end_time: UInt64,
        _lock_period: UInt64,
        _pool_time: UInt64,
    ) -> None:
        assert _authority == Txn.sender, "Invalid Authority"

        # Default 0 token IDs to FRY sentinel (matching V1 behavior)
        stake_token = _stake_token if _stake_token else UInt64(DEFAULT_TOKEN)
        reward_token = _reward_token if _reward_token else UInt64(DEFAULT_TOKEN)

        assert _stake_end_time > _stake_start_time, "End time must be greater than start time"

        self.authority = Txn.sender
        self.stake_token = stake_token
        self.reward_token = reward_token
        self.reward_token_amount = _reward_token_amount
        self.total_stakers = UInt64(0)
        self.total_staked = UInt64(0)
        self.created_At = Global.latest_timestamp
        self.stake_start_time = _stake_start_time
        self.stake_end_time = _stake_end_time
        self.lock_period = _lock_period
        self.rewards_distributed = UInt64(0)
        self.pool_time = _pool_time
        self.apr = UInt64(0)

    # ── Asset opt-in ─────────────────────────────────────────────────────

    @arc4.abimethod()
    def optInAsset(
        self,
        asset_one: Asset,
        asset_two: Asset,
        mbr_pay: gtxn.PaymentTransaction,
    ) -> None:
        assert mbr_pay.receiver == Global.current_application_address
        assert mbr_pay.amount >= Global.asset_opt_in_min_balance, "opt-in balance unverified"

        itxn.AssetTransfer(
            xfer_asset=asset_one,
            asset_receiver=Global.current_application_address,
            asset_amount=0,
            fee=0,
        ).submit()

        itxn.AssetTransfer(
            xfer_asset=asset_two,
            asset_receiver=Global.current_application_address,
            asset_amount=0,
            fee=0,
        ).submit()

    # ── Receive reward tokens ────────────────────────────────────────────

    @arc4.abimethod()
    def assetReceive(
        self,
        reward_token_transfer: gtxn.AssetTransferTransaction,
    ) -> None:
        assert reward_token_transfer.asset_receiver == Global.current_application_address
        assert reward_token_transfer.xfer_asset == Asset(self.reward_token)
        assert reward_token_transfer.asset_amount == self.reward_token_amount

    # ── Staking ──────────────────────────────────────────────────────────

    @arc4.abimethod()
    def stakeTokens(
        self,
        stake_amount: UInt64,
        updated_apr: UInt64,
        stake_axfer: gtxn.AssetTransferTransaction,
        box_tx: gtxn.PaymentTransaction,
    ) -> None:
        # Verify the asset transfer
        assert stake_axfer.asset_amount == stake_amount, "received and entered amount are not valid"
        assert stake_axfer.xfer_asset == Asset(self.stake_token)
        assert stake_axfer.asset_receiver == Global.current_application_address, "invalid receiver"

        # Verify box payment
        assert box_tx.amount == UInt64(28100), "Invalid storage payment"
        assert box_tx.receiver == Global.current_application_address, "invalid receiver"

        user_box = Box(Bytes, key=Txn.sender.bytes)

        if user_box:
            # Existing staker — auto-claim pending rewards
            staked = op.btoi(user_box.extract(0, 8))
            stake_time = op.btoi(user_box.extract(8, 8))
            duration = Global.latest_timestamp - stake_time

            if self.lock_period:
                if self.lock_period < duration:
                    # Lock period passed — calculate and store pending reward
                    reward = _calc_reward(staked, self.apr, duration)
                    if reward > self.reward_token_amount:
                        reward = self.reward_token_amount
                    user_box.replace(16, op.itob(reward))

            # Update staked amount and reset stake time
            user_box.replace(0, op.itob(staked + stake_amount))
            user_box.replace(8, op.itob(Global.latest_timestamp))
            self.total_staked += stake_amount
        else:
            # New staker — create box
            user_box.create(size=UInt64(BOX_SIZE))
            user_box.replace(0, op.itob(stake_amount))
            user_box.replace(8, op.itob(Global.latest_timestamp))
            user_box.replace(16, op.itob(UInt64(0)))
            user_box.replace(24, op.itob(UInt64(0)))
            self.total_staked += stake_amount
            self.total_stakers += UInt64(1)

        self.apr = updated_apr

    # ── Unstaking ────────────────────────────────────────────────────────

    @arc4.abimethod()
    def unstakeTokens(self, unstake_amount: UInt64, updated_apr: UInt64) -> None:
        user_box = Box(Bytes, key=Txn.sender.bytes)
        assert user_box, "No user found"

        staked = op.btoi(user_box.extract(0, 8))
        stake_time = op.btoi(user_box.extract(8, 8))

        assert staked, "No tokens staked"
        assert staked >= unstake_amount, "stake & unstake amount do not match"

        # FIX: Enforce lock period with assert (was silent skip)
        if self.lock_period:
            duration_since_stake = Global.latest_timestamp - stake_time
            assert duration_since_stake >= self.lock_period, "Lock period has not elapsed"

        # FIX: Cap duration at stake_end_time
        effective_end = Global.latest_timestamp
        if self.stake_end_time:
            if Global.latest_timestamp > self.stake_end_time:
                effective_end = self.stake_end_time
        duration = effective_end - stake_time

        # Calculate reward
        reward = _calc_reward(staked, self.apr, duration)
        if reward > self.reward_token_amount:
            reward = self.reward_token_amount

        # Send reward if any
        if reward:
            itxn.AssetTransfer(
                xfer_asset=Asset(self.reward_token),
                asset_receiver=Txn.sender,
                asset_amount=reward,
                fee=0,
            ).submit()
            self.reward_token_amount -= reward
            self.rewards_distributed += reward
            prev_claimed = op.btoi(user_box.extract(24, 8))
            user_box.replace(24, op.itob(prev_claimed + reward))

        # Send staked tokens back
        itxn.AssetTransfer(
            xfer_asset=Asset(self.stake_token),
            asset_receiver=Txn.sender,
            asset_amount=unstake_amount,
            fee=0,
        ).submit()

        # Check and send pending rewards from auto-claim (box[16:24])
        pending = op.btoi(user_box.extract(16, 8))
        if pending:
            itxn.AssetTransfer(
                xfer_asset=Asset(self.reward_token),
                asset_receiver=Txn.sender,
                asset_amount=pending,
                fee=0,
            ).submit()
            user_box.replace(16, op.itob(UInt64(0)))

        # Update staked amount
        user_box.replace(0, op.itob(staked - unstake_amount))
        self.total_staked -= unstake_amount
        self.apr = updated_apr

    # ── Claiming ─────────────────────────────────────────────────────────

    @arc4.abimethod()
    def claimTokens(self, updated_apr: UInt64) -> None:
        user_box = Box(Bytes, key=Txn.sender.bytes)
        assert user_box, "No tokens staked"

        stake_time = op.btoi(user_box.extract(8, 8))
        staked = op.btoi(user_box.extract(0, 8))
        assert staked, "No tokens staked"

        # FIX: Enforce lock period with assert (was silent skip)
        if self.lock_period:
            duration_since_stake = Global.latest_timestamp - stake_time
            assert duration_since_stake >= self.lock_period, "Lock period has not elapsed"

        # FIX: Cap duration at stake_end_time
        effective_end = Global.latest_timestamp
        if self.stake_end_time:
            if Global.latest_timestamp > self.stake_end_time:
                effective_end = self.stake_end_time
        duration = effective_end - stake_time

        # Calculate reward using fixed 128-bit formula
        reward = _calc_reward(staked, self.apr, duration)
        if reward > self.reward_token_amount:
            reward = self.reward_token_amount

        # Send reward if any
        if reward:
            itxn.AssetTransfer(
                xfer_asset=Asset(self.reward_token),
                asset_receiver=Txn.sender,
                asset_amount=reward,
                fee=0,
            ).submit()
            self.reward_token_amount -= reward
            self.rewards_distributed += reward
            prev_claimed = op.btoi(user_box.extract(24, 8))
            user_box.replace(24, op.itob(prev_claimed + reward))
            # FIX: Reset stake time ONLY when reward is actually sent (was unconditional)
            user_box.replace(8, op.itob(Global.latest_timestamp))

        # Check and send pending rewards from auto-claim (box[16:24])
        pending = op.btoi(user_box.extract(16, 8))
        if pending:
            itxn.AssetTransfer(
                xfer_asset=Asset(self.reward_token),
                asset_receiver=Txn.sender,
                asset_amount=pending,
                fee=0,
            ).submit()
            user_box.replace(16, op.itob(UInt64(0)))

        self.apr = updated_apr

    # ── Compound ─────────────────────────────────────────────────────────

    @arc4.abimethod()
    def compound(self, updated_apr: UInt64) -> None:
        user_box = Box(Bytes, key=Txn.sender.bytes)
        assert user_box, "No tokens staked"

        stake_time = op.btoi(user_box.extract(8, 8))
        staked = op.btoi(user_box.extract(0, 8))
        assert staked, "No tokens staked"

        # FIX: Enforce lock period
        if self.lock_period:
            duration_since_stake = Global.latest_timestamp - stake_time
            assert duration_since_stake >= self.lock_period, "Lock period has not elapsed"

        # FIX: Cap duration at stake_end_time
        effective_end = Global.latest_timestamp
        if self.stake_end_time:
            if Global.latest_timestamp > self.stake_end_time:
                effective_end = self.stake_end_time
        duration = effective_end - stake_time

        # Calculate reward
        reward = _calc_reward(staked, self.apr, duration)
        # FIX: Cap reward at remaining pool balance
        if reward > self.reward_token_amount:
            reward = self.reward_token_amount

        if reward:
            # FIX: Deduct from pool and track (was missing — caused unbalanced accounting)
            self.reward_token_amount -= reward
            self.rewards_distributed += reward
            # Add reward to staked amount (compound effect)
            user_box.replace(0, op.itob(staked + reward))
            # FIX: Reset stake_time (was missing — reward window never closed)
            user_box.replace(8, op.itob(Global.latest_timestamp))
            # Track in cumulative claimed
            prev_claimed = op.btoi(user_box.extract(24, 8))
            user_box.replace(24, op.itob(prev_claimed + reward))

        self.apr = updated_apr


# ── Subroutines ──────────────────────────────────────────────────────────


@subroutine
def _calc_reward(staked: UInt64, apr: UInt64, duration: UInt64) -> UInt64:
    """
    Fixed reward formula using 128-bit intermediate math.

    Formula: staked * apr * duration / (10000 * SECONDS_PER_YEAR)

    V1 bug: (staked * apr * ((duration * 100) / 31104000)) / 1000000
            The intermediate (duration * 100) / 31104000 truncates to 0
            for durations < 3.6 days.

    V2 fix: Multiply everything first using wide (128-bit) arithmetic,
            then do a single division at the end.

    Step 1: h, l = mulw(staked, duration)  → 128-bit product
    Step 2: h2, l2 = mulw(l, apr)          → multiply low word by apr
    Step 3: h_final = h * apr + h2         → combine high words
    Step 4: divmodw(h_final, l2, 0, divisor) → 128-bit / 64-bit division
    """
    if not apr or not duration:
        return UInt64(0)

    h, l = op.mulw(staked, duration)
    h2, l2 = op.mulw(l, apr)
    h_final = h * apr + h2
    divisor = UInt64(10000) * UInt64(SECONDS_PER_YEAR)
    qh, ql, _rh, _rl = op.divmodw(h_final, l2, UInt64(0), divisor)
    assert not qh, "Reward overflow"
    return ql
