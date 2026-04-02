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
    urange,
    ensure_budget,
    OpUpFeeSource,
)

MAX_NFTS = 100
USER_BOX_SIZE = 832  # 4 fields * 8 bytes + 100 nft_ids * 8 bytes
SECONDS_PER_DAY = 86400
SECONDS_PER_YEAR = 31104000  # 360 * 86400


class FryNftStaking(ARC4Contract):
    @arc4.abimethod(create="require")
    def init_pool(
        self,
        reward_token_id: UInt64,
        reward_model: UInt64,
        collection_mode: UInt64,
        collection_creator: Account,
        nft_value: UInt64,
        rate_per_day: UInt64,
        total_reward_pool: UInt64,
        apr_rate: UInt64,
        value_per_nft: UInt64,
        pool_end_time: UInt64,
        lock_period: UInt64,
        fee_recipient: Account,
        deposit_fee_bps: UInt64,
        withdraw_fee_bps: UInt64,
        claim_fee_bps: UInt64,
    ) -> None:
        self.creator = Txn.sender
        self.collection_creator = collection_creator
        self.fee_recipient = fee_recipient
        self.reward_token_id = reward_token_id
        self.reward_model = reward_model
        self.collection_mode = collection_mode
        self.nft_value = nft_value
        self.rate_per_day = rate_per_day
        self.total_reward_pool = total_reward_pool
        self.apr_rate = apr_rate
        self.value_per_nft = value_per_nft
        self.pool_end_time = pool_end_time
        self.lock_period = lock_period
        self.total_nfts_staked = UInt64(0)
        self.total_rewards_claimed = UInt64(0)
        self.deposit_fee_bps = deposit_fee_bps
        self.withdraw_fee_bps = withdraw_fee_bps
        self.claim_fee_bps = claim_fee_bps
        self.is_active = UInt64(1)
        self.total_reward_balance = UInt64(0)

    # ── Whitelist management ──────────────────────────────────────────

    @arc4.abimethod()
    def add_to_whitelist(self, nft_id: UInt64) -> None:
        assert Txn.sender == self.creator, "Creator only"
        wl = Box(Bytes, key=b"wl")
        if not wl:
            wl.create(size=UInt64(8))
            wl.replace(0, op.itob(nft_id))
        else:
            current_len = wl.length
            wl.resize(current_len + UInt64(8))
            wl.replace(current_len, op.itob(nft_id))

    @arc4.abimethod()
    def remove_from_whitelist(self, nft_id: UInt64) -> None:
        assert Txn.sender == self.creator, "Creator only"
        wl = Box(Bytes, key=b"wl")
        assert wl, "Whitelist empty"
        count = wl.length // UInt64(8)
        ensure_budget(count * UInt64(40) + UInt64(200), OpUpFeeSource.GroupCredit)
        found = UInt64(0)
        for idx in urange(count):
            stored_id = op.btoi(wl.extract(idx * UInt64(8), UInt64(8)))
            if stored_id == nft_id:
                found = UInt64(1)
                if idx < count - UInt64(1):
                    last = wl.extract((count - UInt64(1)) * UInt64(8), UInt64(8))
                    wl.replace(idx * UInt64(8), last)
                if count == UInt64(1):
                    del wl.value
                else:
                    wl.resize((count - UInt64(1)) * UInt64(8))
                break
        assert found, "NFT not in whitelist"

    # ── Asset opt-in ─────────────────────────────────────────────────

    @arc4.abimethod()
    def opt_in_asset(
        self,
        asset: UInt64,
        mbr_payment: gtxn.PaymentTransaction,
    ) -> None:
        """Opt contract into an ASA. Call before staking an NFT or depositing ASA rewards."""
        assert mbr_payment.receiver == Global.current_application_address
        itxn.AssetTransfer(
            xfer_asset=Asset(asset),
            asset_receiver=Global.current_application_address,
            asset_amount=0,
            fee=0,
        ).submit()

    # ── Reward deposits ───────────────────────────────────────────────

    @arc4.abimethod()
    def deposit_rewards(self, reward_txn: gtxn.AssetTransferTransaction) -> None:
        assert Txn.sender == self.creator, "Creator only"
        assert reward_txn.xfer_asset == Asset(self.reward_token_id), "Wrong reward token"
        assert reward_txn.asset_receiver == Global.current_application_address, "Wrong receiver"
        self.total_reward_balance += reward_txn.asset_amount

    @arc4.abimethod()
    def deposit_rewards_algo(self, payment: gtxn.PaymentTransaction) -> None:
        assert Txn.sender == self.creator, "Creator only"
        assert self.reward_token_id == UInt64(0), "Pool uses ASA rewards"
        assert payment.receiver == Global.current_application_address, "Wrong receiver"
        self.total_reward_balance += payment.amount

    # ── Staking ───────────────────────────────────────────────────────

    @arc4.abimethod()
    def stake_nft(
        self,
        nft_transfer: gtxn.AssetTransferTransaction,
        box_payment: gtxn.PaymentTransaction,
    ) -> None:
        assert self.is_active == UInt64(1), "Pool is paused"

        nft_asset = nft_transfer.xfer_asset
        nft_id = nft_asset.id
        assert nft_transfer.asset_amount == UInt64(1), "Must transfer exactly 1 NFT"
        assert nft_transfer.asset_receiver == Global.current_application_address
        assert box_payment.receiver == Global.current_application_address

        # Verify collection membership
        self._verify_collection(nft_id)

        user_box = Box(Bytes, key=Txn.sender.bytes)
        if not user_box:
            # New staker — create box
            user_box.create(size=UInt64(USER_BOX_SIZE))
            now = Global.latest_timestamp
            user_box.replace(0, op.itob(UInt64(1)))       # nft_count
            user_box.replace(8, op.itob(now))              # first_stake_time
            user_box.replace(16, op.itob(now))             # last_claim_time
            user_box.replace(24, op.itob(UInt64(0)))       # total_claimed
            user_box.replace(32, op.itob(nft_id))          # nft_ids[0]
        else:
            # Existing staker — auto-claim first, then add NFT
            self._do_claim_rewards()
            nft_count = op.btoi(user_box.extract(0, 8))
            assert nft_count < UInt64(MAX_NFTS), "Max NFTs reached"
            user_box.replace(32 + nft_count * UInt64(8), op.itob(nft_id))
            user_box.replace(0, op.itob(nft_count + UInt64(1)))

        self.total_nfts_staked += UInt64(1)

    # ── Unstaking ─────────────────────────────────────────────────────

    @arc4.abimethod()
    def unstake_nft(self, nft_id: UInt64) -> None:
        user_box = Box(Bytes, key=Txn.sender.bytes)
        assert user_box, "No stake found"

        nft_count = op.btoi(user_box.extract(0, 8))
        assert nft_count > UInt64(0), "No NFTs staked"

        # Check lock period
        first_stake = op.btoi(user_box.extract(8, 8))
        elapsed_since_stake = Global.latest_timestamp - first_stake
        if self.lock_period:
            assert elapsed_since_stake >= self.lock_period, "Lock period not met"

        # Find the NFT in the user's list
        found_idx = UInt64(0)
        found = UInt64(0)
        for idx in urange(nft_count):
            stored = op.btoi(user_box.extract(32 + idx * UInt64(8), UInt64(8)))
            if stored == nft_id:
                found_idx = idx
                found = UInt64(1)
                break
        assert found, "NFT not found in stake"

        # Auto-claim rewards before unstaking
        self._do_claim_rewards()

        # Swap with last and decrement count
        new_count = nft_count - UInt64(1)
        if found_idx < new_count:
            last_nft = user_box.extract(32 + new_count * UInt64(8), UInt64(8))
            user_box.replace(32 + found_idx * UInt64(8), last_nft)
        user_box.replace(32 + new_count * UInt64(8), op.itob(UInt64(0)))
        user_box.replace(0, op.itob(new_count))

        # Send NFT back to user
        itxn.AssetTransfer(
            xfer_asset=Asset(nft_id),
            asset_receiver=Txn.sender,
            asset_amount=1,
            fee=0,
        ).submit()

        self.total_nfts_staked -= UInt64(1)

        # Delete box if no more NFTs
        if new_count == UInt64(0):
            del user_box.value

    # ── Claiming ──────────────────────────────────────────────────────

    @arc4.abimethod()
    def claim_rewards(self) -> None:
        user_box = Box(Bytes, key=Txn.sender.bytes)
        assert user_box, "No stake found"
        self._do_claim_rewards()

    # ── Admin ─────────────────────────────────────────────────────────

    @arc4.abimethod()
    def pause_pool(self) -> None:
        assert Txn.sender == self.creator, "Creator only"
        self.is_active = UInt64(0)

    @arc4.abimethod()
    def resume_pool(self) -> None:
        assert Txn.sender == self.creator, "Creator only"
        self.is_active = UInt64(1)

    @arc4.abimethod()
    def update_end_time(self, new_end_time: UInt64) -> None:
        assert Txn.sender == self.creator, "Creator only"
        self.pool_end_time = new_end_time

    # ── Internal: reward calculation & distribution ───────────────────

    @subroutine
    def _do_claim_rewards(self) -> None:
        user_box = Box(Bytes, key=Txn.sender.bytes)
        nft_count = op.btoi(user_box.extract(0, 8))
        if nft_count == UInt64(0):
            return

        last_claim = op.btoi(user_box.extract(16, 8))
        now = Global.latest_timestamp

        # Cap elapsed time at pool_end_time if set
        effective_now = now
        if self.pool_end_time:
            if now > self.pool_end_time:
                effective_now = self.pool_end_time

        if effective_now <= last_claim:
            return

        elapsed = effective_now - last_claim
        reward = UInt64(0)

        if self.reward_model == UInt64(0):
            # Fixed rate: nft_count * rate_per_day * elapsed / 86400
            reward = _mul_div(nft_count * self.rate_per_day, elapsed, UInt64(SECONDS_PER_DAY))
        elif self.reward_model == UInt64(1):
            # Proportional: total_reward_pool * nft_count * elapsed / (total_nfts_staked * total_duration)
            if self.total_nfts_staked > UInt64(0) and self.pool_end_time > UInt64(0):
                total_duration = self.pool_end_time - op.btoi(user_box.extract(8, 8))
                if total_duration > UInt64(0):
                    numerator = _mul_128(self.total_reward_pool, nft_count * elapsed)
                    denominator = self.total_nfts_staked * total_duration
                    reward = _div_128(numerator, denominator)
        elif self.reward_model == UInt64(2):
            # APR: nft_count * value_per_nft * apr_rate * elapsed / (10000 * 31104000)
            step1 = nft_count * self.apr_rate
            h, l = op.mulw(self.value_per_nft, elapsed)
            h2, l2 = op.mulw(l, step1)
            h_final = h * step1 + h2
            divisor = UInt64(10000) * UInt64(SECONDS_PER_YEAR)
            qh, ql, _rh, _rl = op.divmodw(h_final, l2, UInt64(0), divisor)
            assert not qh, "Reward overflow"
            reward = ql

        # Clamp to available balance
        if reward > self.total_reward_balance:
            reward = self.total_reward_balance

        if reward > UInt64(0):
            # Send reward
            if self.reward_token_id:
                itxn.AssetTransfer(
                    xfer_asset=Asset(self.reward_token_id),
                    asset_receiver=Txn.sender,
                    asset_amount=reward,
                    fee=0,
                ).submit()
            else:
                itxn.Payment(
                    receiver=Txn.sender,
                    amount=reward,
                    fee=0,
                ).submit()

            self.total_reward_balance -= reward
            self.total_rewards_claimed += reward

            # Update user total_claimed
            prev_claimed = op.btoi(user_box.extract(24, 8))
            user_box.replace(24, op.itob(prev_claimed + reward))

        # Update last_claim_time
        user_box.replace(16, op.itob(now))

    # ── Internal: collection verification ─────────────────────────────

    @subroutine
    def _verify_collection(self, nft_id: UInt64) -> None:
        mode = self.collection_mode

        if mode == UInt64(0):
            # Creator address mode
            creator, exists = op.AssetParamsGet.asset_creator(nft_id)
            assert exists, "Asset does not exist"
            assert creator == self.collection_creator, "Wrong collection"
        elif mode == UInt64(1):
            # Whitelist mode
            assert _is_in_whitelist(nft_id), "NFT not whitelisted"
        elif mode == UInt64(2):
            # Both: creator address OR whitelist
            creator, exists = op.AssetParamsGet.asset_creator(nft_id)
            assert exists, "Asset does not exist"
            creator_match = creator == self.collection_creator
            wl_match = _is_in_whitelist(nft_id)
            assert creator_match or wl_match, "NFT not in collection"


@subroutine
def _is_in_whitelist(nft_id: UInt64) -> bool:
    wl = Box(Bytes, key=b"wl")
    if not wl:
        return False
    count = wl.length // UInt64(8)
    for idx in urange(count):
        stored = op.btoi(wl.extract(idx * UInt64(8), UInt64(8)))
        if stored == nft_id:
            return True
    return False


@subroutine
def _mul_div(a: UInt64, b: UInt64, c: UInt64) -> UInt64:
    """Compute a * b // c using 128-bit intermediate."""
    h, l = op.mulw(a, b)
    qh, ql, _rh, _rl = op.divmodw(h, l, UInt64(0), c)
    assert not qh, "Overflow"
    return ql


@subroutine
def _mul_128(a: UInt64, b: UInt64) -> tuple[UInt64, UInt64]:
    """Return 128-bit product (high, low)."""
    return op.mulw(a, b)


@subroutine
def _div_128(numerator: tuple[UInt64, UInt64], denominator: UInt64) -> UInt64:
    """Divide 128-bit (high, low) by 64-bit denominator."""
    qh, ql, _rh, _rl = op.divmodw(numerator[0], numerator[1], UInt64(0), denominator)
    assert not qh, "Overflow"
    return ql
