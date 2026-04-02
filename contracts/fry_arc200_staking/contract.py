from algopy import (
    ARC4Contract,
    Account,
    Application,
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

# ARC-200 method selectors (first 4 bytes of SHA-512/256 of ABI signature)
# arc200_transfer(address,uint256)bool => da7025b9
ARC200_TRANSFER_SEL = b"\xda\x70\x25\xb9"


class FryArc200Staking(ARC4Contract):
    """ARC-200 LP token staking — users stake ARC-200 LP tokens (e.g. Nomadex pools).

    Changes from V3:
    - Staked token is an ARC-200 app (lp_token_app) instead of an ASA
    - Staking: user transfers ARC-200 tokens to contract in group txn, contract verifies
    - Unstaking: contract calls inner arc200_transfer to return LP tokens
    - Rewards support 3 types: native (0), ASA (1), ARC-200 (2)
    """

    # ── Create ───────────────────────────────────────────────────────────

    @arc4.abimethod(create="require")
    def init_staking(
        self,
        _authority: Account,
        _lp_token_app: UInt64,
        _reward_token_id: UInt64,
        _reward_token_type: UInt64,
        _reward_token_amount: UInt64,
        _stake_start_time: UInt64,
        _stake_end_time: UInt64,
        _lock_period: UInt64,
        _pool_time: UInt64,
    ) -> None:
        assert _authority == Txn.sender, "Invalid Authority"
        assert _lp_token_app, "LP token app ID required"
        assert _reward_token_type <= UInt64(2), "Invalid reward type"
        assert _stake_end_time > _stake_start_time, "End time must be greater than start time"

        self.authority = Txn.sender
        self.lp_token_app = _lp_token_app
        self.reward_token_id = _reward_token_id
        self.reward_token_type = _reward_token_type  # 0=native, 1=ASA, 2=ARC-200
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

    # ── Asset opt-in (for ASA rewards only) ─────────────────────────────

    @arc4.abimethod()
    def optInAsset(
        self,
        asset_id: UInt64,
        mbr_pay: gtxn.PaymentTransaction,
    ) -> None:
        """Opt contract into an ASA (only needed for ASA reward tokens)."""
        assert mbr_pay.receiver == Global.current_application_address
        assert mbr_pay.amount >= Global.asset_opt_in_min_balance, "opt-in balance unverified"
        assert asset_id, "Cannot opt into native token"

        itxn.AssetTransfer(
            xfer_asset=Asset(asset_id),
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
        """Receive ASA reward tokens."""
        assert self.reward_token_type == UInt64(1), "Pool does not use ASA rewards"
        assert reward_token_transfer.asset_receiver == Global.current_application_address
        assert reward_token_transfer.xfer_asset == Asset(self.reward_token_id)
        assert reward_token_transfer.asset_amount == self.reward_token_amount

    @arc4.abimethod()
    def nativeReceive(
        self,
        reward_payment: gtxn.PaymentTransaction,
    ) -> None:
        """Receive native token (VOI) rewards."""
        assert self.reward_token_type == UInt64(0), "Pool does not use native rewards"
        assert reward_payment.receiver == Global.current_application_address
        assert reward_payment.amount == self.reward_token_amount

    @arc4.abimethod()
    def arc200RewardReceive(
        self,
        reward_transfer_call: gtxn.ApplicationCallTransaction,
    ) -> None:
        """Receive ARC-200 reward tokens. User must call arc200_transfer to contract in group txn."""
        assert self.reward_token_type == UInt64(2), "Pool does not use ARC-200 rewards"
        assert reward_transfer_call.app_id == Application(self.reward_token_id)
        # Verify the ARC-200 transfer was directed at this contract
        # The app call's first arg should be the arc200_transfer selector
        assert reward_transfer_call.app_args(0) == ARC200_TRANSFER_SEL

    # ── Staking ──────────────────────────────────────────────────────────

    @arc4.abimethod()
    def stakeTokens(
        self,
        stake_amount: UInt64,
        updated_apr: UInt64,
        lp_transfer_call: gtxn.ApplicationCallTransaction,
        box_tx: gtxn.PaymentTransaction,
    ) -> None:
        """Stake ARC-200 LP tokens. User must call arc200_transfer(contract, amount) in group txn."""
        assert stake_amount, "Stake amount must be positive"

        # Verify the ARC-200 transfer call
        assert lp_transfer_call.app_id == Application(self.lp_token_app), "Wrong LP token app"
        assert lp_transfer_call.app_args(0) == ARC200_TRANSFER_SEL, "Not an arc200_transfer call"

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

        # Enforce lock period
        if self.lock_period:
            duration_since_stake = Global.latest_timestamp - stake_time
            assert duration_since_stake >= self.lock_period, "Lock period has not elapsed"

        # Cap duration at stake_end_time
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
            self._send_reward(reward)
            self.reward_token_amount -= reward
            self.rewards_distributed += reward
            prev_claimed = op.btoi(user_box.extract(24, 8))
            user_box.replace(24, op.itob(prev_claimed + reward))

        # Return staked LP tokens via inner ARC-200 transfer
        _arc200_transfer(self.lp_token_app, Txn.sender, unstake_amount)

        # Check and send pending rewards from auto-claim (box[16:24])
        pending = op.btoi(user_box.extract(16, 8))
        if pending:
            self._send_reward(pending)
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

        # Enforce lock period
        if self.lock_period:
            duration_since_stake = Global.latest_timestamp - stake_time
            assert duration_since_stake >= self.lock_period, "Lock period has not elapsed"

        # Cap duration at stake_end_time
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
            self._send_reward(reward)
            self.reward_token_amount -= reward
            self.rewards_distributed += reward
            prev_claimed = op.btoi(user_box.extract(24, 8))
            user_box.replace(24, op.itob(prev_claimed + reward))
            # Reset stake time ONLY when reward is actually sent
            user_box.replace(8, op.itob(Global.latest_timestamp))

        # Check and send pending rewards from auto-claim (box[16:24])
        pending = op.btoi(user_box.extract(16, 8))
        if pending:
            self._send_reward(pending)
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

        # Enforce lock period
        if self.lock_period:
            duration_since_stake = Global.latest_timestamp - stake_time
            assert duration_since_stake >= self.lock_period, "Lock period has not elapsed"

        # Cap duration at stake_end_time
        effective_end = Global.latest_timestamp
        if self.stake_end_time:
            if Global.latest_timestamp > self.stake_end_time:
                effective_end = self.stake_end_time
        duration = effective_end - stake_time

        # Calculate reward
        reward = _calc_reward(staked, self.apr, duration)
        if reward > self.reward_token_amount:
            reward = self.reward_token_amount

        if reward:
            # Deduct from pool and track
            self.reward_token_amount -= reward
            self.rewards_distributed += reward
            # Add reward to staked amount (compound effect)
            user_box.replace(0, op.itob(staked + reward))
            # Reset stake_time
            user_box.replace(8, op.itob(Global.latest_timestamp))
            # Track in cumulative claimed
            prev_claimed = op.btoi(user_box.extract(24, 8))
            user_box.replace(24, op.itob(prev_claimed + reward))

        self.apr = updated_apr

    # ── Internal: reward distribution ────────────────────────────────────

    @subroutine
    def _send_reward(self, reward: UInt64) -> None:
        """Send reward tokens based on reward_token_type."""
        if self.reward_token_type == UInt64(1):
            # ASA reward
            itxn.AssetTransfer(
                xfer_asset=Asset(self.reward_token_id),
                asset_receiver=Txn.sender,
                asset_amount=reward,
                fee=0,
            ).submit()
        elif self.reward_token_type == UInt64(2):
            # ARC-200 reward
            _arc200_transfer(self.reward_token_id, Txn.sender, reward)
        else:
            # Native reward (VOI/ALGO)
            itxn.Payment(
                receiver=Txn.sender,
                amount=reward,
                fee=0,
            ).submit()


# ── Subroutines ──────────────────────────────────────────────────────────


@subroutine
def _arc200_transfer(token_app: UInt64, receiver: Account, amount: UInt64) -> None:
    """Call arc200_transfer(address,uint256)bool on an ARC-200 contract via inner txn.

    ABI encoding: 4-byte selector + 32-byte address + 32-byte uint256
    """
    # Build ABI-encoded args: address (32 bytes) + uint256 (32 bytes, big-endian)
    # Address is the raw 32-byte public key
    # uint256: pad UInt64 to 32 bytes (24 zero bytes + 8-byte big-endian)
    amount_bytes = Bytes(b"\x00" * 24) + op.itob(amount)
    args = receiver.bytes + amount_bytes

    itxn.ApplicationCall(
        app_id=Application(token_app),
        app_args=(ARC200_TRANSFER_SEL, args),
        fee=0,
    ).submit()


@subroutine
def _calc_reward(staked: UInt64, apr: UInt64, duration: UInt64) -> UInt64:
    """
    Fixed reward formula using 128-bit intermediate math.

    Formula: staked * apr * duration / (10000 * SECONDS_PER_YEAR)

    Step 1: h, l = mulw(staked, duration)  -> 128-bit product
    Step 2: h2, l2 = mulw(l, apr)          -> multiply low word by apr
    Step 3: h_final = h * apr + h2         -> combine high words
    Step 4: divmodw(h_final, l2, 0, divisor) -> 128-bit / 64-bit division
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
