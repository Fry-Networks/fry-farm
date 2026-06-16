import algopy
from algopy import (
    ARC4Contract,
    UInt64,
    Bytes,
    BigUInt,
    Global,
    Txn,
    op,
    arc4,
    itxn,
    subroutine,
    Account,
    Asset,
    gtxn,
    Box,
)

SECONDS_PER_YEAR = 31104000
REWARD_DIVISOR = 3_110_400_000_000_000


class FryFarming(ARC4Contract):
    def __init__(self) -> None:
        self.authority = Account()
        self.created_At = UInt64(0)
        self.apr = UInt64(0)
        self.farm_start_time = UInt64(0)
        self.farm_end_time = UInt64(0)
        self.lock_period = UInt64(0)
        self.stake_token = UInt64(0)
        self.reward_token = UInt64(0)
        self.reward_token_amount = UInt64(0)
        self.total_staked = UInt64(0)
        self.total_farmers = UInt64(0)
        self.total_stakers = UInt64(0)
        self.fry_token = UInt64(0)
        self.fry_reward_fee = UInt64(0)
        self.lp_token_a = UInt64(0)
        self.lp_token_b = UInt64(0)
        self.reward_distribution_rate = UInt64(0)
        self.reward_distribution_schedule = UInt64(0)
        self.rewards_distributed = UInt64(0)

    @arc4.abimethod()
    def init_farming(
        self,
        _authority: Account,
        _lp_token_a: UInt64,
        _lp_token_b: UInt64,
        _reward_token: UInt64,
        _reward_token_amount: UInt64,
        _farm_start_time: UInt64,
        _farm_end_time: UInt64,
        _lock_period: UInt64,
        _farm_entry_fee: UInt64,
        _reward_distribution_rate: UInt64,
        _reward_distribution_schedule: UInt64,
        _fry_token: UInt64,
        _fry_reward_fee: UInt64,
    ) -> None:
        assert Txn.sender == Global.creator_address, "not creator"
        self.authority = _authority
        self.lp_token_a = _lp_token_a
        self.lp_token_b = _lp_token_b
        self.reward_token = _reward_token
        self.reward_token_amount = _reward_token_amount
        self.total_farmers = UInt64(0)
        self.total_staked = UInt64(0)
        self.created_At = Global.latest_timestamp
        self.farm_start_time = _farm_start_time
        self.farm_end_time = _farm_end_time
        self.lock_period = _lock_period
        self.rewards_distributed = UInt64(0)
        self.reward_distribution_rate = _reward_distribution_rate
        self.reward_distribution_schedule = _reward_distribution_schedule
        self.fry_token = _fry_token
        self.fry_reward_fee = _fry_reward_fee
        self.apr = UInt64(0)
        # Deployed TEAL sets stake_token from _lp_token_a
        self.stake_token = _lp_token_a
        self.total_stakers = UInt64(0)
        # _farm_entry_fee accepted but ignored to match deployed ABI

    @arc4.abimethod()
    def optInAsset(
        self,
        lp_token_a: Asset,
        lp_token_b: Asset,
        reward_token: Asset,
        mbr_pay: gtxn.PaymentTransaction,
    ) -> None:
        assert Txn.sender == Global.creator_address, "not creator"
        assert mbr_pay.receiver == Global.current_application_address, "invalid receiver"

        if lp_token_a.id != UInt64(0):
            itxn.AssetTransfer(
                xfer_asset=lp_token_a,
                asset_receiver=Global.current_application_address,
                asset_amount=UInt64(0),
                fee=0,
            ).submit()

        if lp_token_b.id != UInt64(0):
            itxn.AssetTransfer(
                xfer_asset=lp_token_b,
                asset_receiver=Global.current_application_address,
                asset_amount=UInt64(0),
                fee=0,
            ).submit()

        if reward_token.id != UInt64(0):
            itxn.AssetTransfer(
                xfer_asset=reward_token,
                asset_receiver=Global.current_application_address,
                asset_amount=UInt64(0),
                fee=0,
            ).submit()

    @arc4.abimethod()
    def assetReceive(self, reward_token_transfer: gtxn.AssetTransferTransaction) -> None:
        assert reward_token_transfer.asset_receiver == Global.current_application_address, "wrong receiver"
        assert reward_token_transfer.xfer_asset == Asset(self.reward_token), "wrong reward token"
        self.reward_token_amount += reward_token_transfer.asset_amount

    @arc4.abimethod()
    def stakeTokens(
        self,
        stake_amount: UInt64,
        updated_apr: UInt64,
        stake_pay: gtxn.PaymentTransaction,
        stake_axfer: gtxn.AssetTransferTransaction,
        box_tx: gtxn.PaymentTransaction,
    ) -> None:
        assert stake_axfer.asset_amount == stake_amount, "amount mismatch"
        assert stake_axfer.xfer_asset == Asset(self.stake_token), "wrong stake token"
        assert stake_axfer.asset_receiver == Global.current_application_address, "wrong receiver"
        assert stake_pay.receiver == Global.current_application_address, "invalid stake_pay receiver"
        assert box_tx.receiver == Global.current_application_address, "invalid box_tx receiver"

        user_box = Box(Bytes, key=Txn.sender.bytes)
        now = Global.latest_timestamp

        if user_box:
            # Existing stake: add to current amount
            current_stake = op.btoi(user_box.extract(0, 8))
            new_stake = current_stake + stake_amount
            user_box.replace(0, op.itob(new_stake))
            # Update stake_time and last_claim_time to now
            user_box.replace(8, op.itob(now))
            user_box.replace(24, op.itob(now))
        else:
            # New staker
            user_box.create(size=UInt64(32))
            user_box.replace(0, op.itob(stake_amount))
            user_box.replace(8, op.itob(now))
            user_box.replace(24, op.itob(now))
            self.total_farmers += 1
            self.total_stakers += 1

        self.total_staked += stake_amount
        self.apr = updated_apr

    @arc4.abimethod(readonly=True)
    def getUserStake(self, user: Account) -> arc4.Tuple[UInt64, UInt64, UInt64]:
        user_box = Box(Bytes, key=user.bytes)
        if not user_box:
            return arc4.Tuple((UInt64(0), UInt64(0), UInt64(0)))
        staked = op.btoi(user_box.extract(0, 8))
        stake_time = op.btoi(user_box.extract(8, 8))
        last_claim = op.btoi(user_box.extract(24, 8))
        return arc4.Tuple((staked, stake_time, last_claim))

    @arc4.abimethod()
    def unstakeTokens(self, unstake_amount: UInt64) -> None:
        assert unstake_amount > 0, "Cannot unstake zero amount"

        user_box = Box(Bytes, key=Txn.sender.bytes)
        assert user_box, "No staking record found"

        staked = op.btoi(user_box.extract(0, 8))
        assert staked >= unstake_amount, "Cannot unstake more than staked"

        stake_time = op.btoi(user_box.extract(8, 8))
        if self.lock_period > 0:
            assert Global.latest_timestamp - stake_time >= self.lock_period, "Tokens still locked"

        new_stake = staked - unstake_amount
        user_box.replace(0, op.itob(new_stake))

        itxn.AssetTransfer(
            xfer_asset=Asset(self.stake_token),
            asset_receiver=Txn.sender,
            asset_amount=unstake_amount,
            fee=0,
        ).submit()

        self.total_staked -= unstake_amount
        if new_stake == 0:
            self.total_farmers -= 1
            self.total_stakers -= 1
            # Box deletion not available in Puya 5.7.1; leave zeroed box
            user_box.replace(8, op.itob(UInt64(0)))
            user_box.replace(24, op.itob(UInt64(0)))

    @subroutine
    def _calc_reward(self, staked: UInt64, apr: UInt64, duration: UInt64, rate: UInt64) -> UInt64:
        if apr == 0 or duration == 0 or staked == 0 or rate == 0:
            return UInt64(0)
        reward_big = (
            BigUInt(duration) * BigUInt(apr) * BigUInt(staked) * BigUInt(rate)
            // BigUInt(REWARD_DIVISOR)
        )
        return op.btoi(reward_big.bytes)

    @arc4.abimethod()
    def claimRewards(self) -> None:
        user_box = Box(Bytes, key=Txn.sender.bytes)
        assert user_box, "No staking record found"

        assert Global.latest_timestamp >= self.farm_start_time, "Farming not active"

        staked = op.btoi(user_box.extract(0, 8))
        last_claim = op.btoi(user_box.extract(24, 8))

        effective_end = Global.latest_timestamp
        if self.farm_end_time:
            if Global.latest_timestamp > self.farm_end_time:
                effective_end = self.farm_end_time

        if effective_end < last_claim:
            duration = UInt64(0)
        else:
            duration = effective_end - last_claim

        # Enforce claim schedule cooldown
        assert Global.latest_timestamp > last_claim + self.reward_distribution_schedule, "Claim too soon"

        reward = self._calc_reward(staked, self.apr, duration, self.reward_distribution_rate)

        # Clamp reward to remaining pool balance (matches deployed safety check)
        pool_balance = self.reward_token_amount - self.rewards_distributed
        if reward > pool_balance:
            reward = pool_balance

        if reward > 0:
            itxn.AssetTransfer(
                xfer_asset=Asset(self.reward_token),
                asset_receiver=Txn.sender,
                asset_amount=reward,
                fee=0,
            ).submit()
            self.rewards_distributed += reward
            # Note: deployed TEAL does NOT decrement reward_token_amount

        now = Global.latest_timestamp
        user_box.replace(24, op.itob(now))

    @arc4.abimethod(readonly=True)
    def checkRewards(self) -> UInt64:
        user_box = Box(Bytes, key=Txn.sender.bytes)
        if not user_box:
            return UInt64(0)

        staked = op.btoi(user_box.extract(0, 8))
        last_claim = op.btoi(user_box.extract(24, 8))

        effective_end = Global.latest_timestamp
        if self.farm_end_time:
            if Global.latest_timestamp > self.farm_end_time:
                effective_end = self.farm_end_time

        if effective_end < last_claim:
            duration = UInt64(0)
        else:
            duration = effective_end - last_claim

        reward = self._calc_reward(staked, self.apr, duration, self.reward_distribution_rate)
        return reward
