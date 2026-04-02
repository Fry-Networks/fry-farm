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
    urange,
    ensure_budget,
    OpUpFeeSource,
)

MAX_NFTS = 100
# Box layout: 4 fields * 8 bytes + 100 entries * 16 bytes (app_id + token_index per entry)
USER_BOX_SIZE = 1632  # 32 + 100 * 16
SECONDS_PER_DAY = 86400
SECONDS_PER_YEAR = 31104000  # 360 * 86400

# ARC-72 method selectors (first 4 bytes of SHA-512/256 of ABI signature)
# arc72_transferFrom(address,address,uint256) => 3fd6251d
ARC72_TRANSFER_SEL = b"\x3f\xd6\x25\x1d"

# ARC-200 method selector for reward distribution
# arc200_transfer(address,uint256)bool => da7025b9
ARC200_TRANSFER_SEL = b"\xda\x70\x25\xb9"


class FryArc72Staking(ARC4Contract):
    """ARC-72 NFT staking — users stake ARC-72 NFTs via smart contract calls.

    Changes from FryNftStaking:
    - NFTs are ARC-72 (app-based) instead of ASAs
    - Staking: user approves contract, contract calls arc72_transferFrom
    - Unstaking: contract calls arc72_transferFrom to return NFT
    - Collection verification uses app ID instead of asset creator
    - NFT IDs stored as (collection_app, token_index) pairs (16 bytes each)
    - Rewards support 3 types: native (0), ASA (1), ARC-200 (2)
    """

    @arc4.abimethod(create="require")
    def init_pool(
        self,
        reward_token_id: UInt64,
        reward_token_type: UInt64,
        reward_model: UInt64,
        collection_mode: UInt64,
        collection_app: UInt64,
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
        self.collection_app = collection_app
        self.fee_recipient = fee_recipient
        self.reward_token_id = reward_token_id
        self.reward_token_type = reward_token_type  # 0=native, 1=ASA, 2=ARC-200
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
    def add_to_whitelist(self, collection_app_id: UInt64, token_index: UInt64) -> None:
        """Add an ARC-72 NFT (app_id, token_index) to the whitelist."""
        assert Txn.sender == self.creator, "Creator only"
        wl = Box(Bytes, key=b"wl")
        entry = op.itob(collection_app_id) + op.itob(token_index)
        if not wl:
            wl.create(size=UInt64(16))
            wl.replace(0, entry)
        else:
            current_len = wl.length
            wl.resize(current_len + UInt64(16))
            wl.replace(current_len, entry)

    @arc4.abimethod()
    def remove_from_whitelist(self, collection_app_id: UInt64, token_index: UInt64) -> None:
        """Remove an ARC-72 NFT (app_id, token_index) from the whitelist."""
        assert Txn.sender == self.creator, "Creator only"
        wl = Box(Bytes, key=b"wl")
        assert wl, "Whitelist empty"
        count = wl.length // UInt64(16)
        ensure_budget(count * UInt64(60) + UInt64(200), OpUpFeeSource.GroupCredit)
        found = UInt64(0)
        for idx in urange(count):
            stored_app = op.btoi(wl.extract(idx * UInt64(16), UInt64(8)))
            stored_idx = op.btoi(wl.extract(idx * UInt64(16) + UInt64(8), UInt64(8)))
            if stored_app == collection_app_id and stored_idx == token_index:
                found = UInt64(1)
                if idx < count - UInt64(1):
                    last = wl.extract((count - UInt64(1)) * UInt64(16), UInt64(16))
                    wl.replace(idx * UInt64(16), last)
                if count == UInt64(1):
                    del wl.value
                else:
                    wl.resize((count - UInt64(1)) * UInt64(16))
                break
        assert found, "NFT not in whitelist"

    # ── Asset opt-in (for ASA rewards only) ───────────────────────────

    @arc4.abimethod()
    def opt_in_asset(
        self,
        asset: UInt64,
        mbr_payment: gtxn.PaymentTransaction,
    ) -> None:
        """Opt contract into an ASA (only needed for ASA reward tokens)."""
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
        assert self.reward_token_type == UInt64(1), "Pool does not use ASA rewards"
        assert reward_txn.xfer_asset == Asset(self.reward_token_id), "Wrong reward token"
        assert reward_txn.asset_receiver == Global.current_application_address, "Wrong receiver"
        self.total_reward_balance += reward_txn.asset_amount

    @arc4.abimethod()
    def deposit_rewards_algo(self, payment: gtxn.PaymentTransaction) -> None:
        assert Txn.sender == self.creator, "Creator only"
        assert self.reward_token_type == UInt64(0), "Pool does not use native rewards"
        assert payment.receiver == Global.current_application_address, "Wrong receiver"
        self.total_reward_balance += payment.amount

    @arc4.abimethod()
    def deposit_rewards_arc200(
        self, reward_transfer_call: gtxn.ApplicationCallTransaction
    ) -> None:
        """Deposit ARC-200 reward tokens. Creator must call arc200_transfer to contract in group txn."""
        assert Txn.sender == self.creator, "Creator only"
        assert self.reward_token_type == UInt64(2), "Pool does not use ARC-200 rewards"
        assert reward_transfer_call.app_id == Application(self.reward_token_id)
        assert reward_transfer_call.app_args(0) == ARC200_TRANSFER_SEL
        # Amount tracking: creator must pass the amount separately since we can't
        # easily decode uint256 from the app call args on-chain
        # We trust the creator to deposit the correct amount and verify via arc200_balanceOf off-chain

    @arc4.abimethod()
    def set_reward_balance(self, new_balance: UInt64) -> None:
        """Creator sets the tracked reward balance (after ARC-200 deposit verification off-chain)."""
        assert Txn.sender == self.creator, "Creator only"
        self.total_reward_balance = new_balance

    # ── Staking ───────────────────────────────────────────────────────

    @arc4.abimethod()
    def stake_nft(
        self,
        collection_app_id: UInt64,
        token_index: UInt64,
        box_payment: gtxn.PaymentTransaction,
    ) -> None:
        """Stake an ARC-72 NFT. User must first arc72_approve(contract_address, token_id).
        Contract pulls NFT via inner arc72_transferFrom."""
        assert self.is_active == UInt64(1), "Pool is paused"
        assert box_payment.receiver == Global.current_application_address

        # Verify collection membership
        self._verify_collection(collection_app_id, token_index)

        # Pull NFT from user to contract via inner arc72_transferFrom
        _arc72_transfer_from(collection_app_id, Txn.sender, Global.current_application_address, token_index)

        user_box = Box(Bytes, key=Txn.sender.bytes)
        if not user_box:
            # New staker — create box
            user_box.create(size=UInt64(USER_BOX_SIZE))
            now = Global.latest_timestamp
            user_box.replace(0, op.itob(UInt64(1)))       # nft_count
            user_box.replace(8, op.itob(now))              # first_stake_time
            user_box.replace(16, op.itob(now))             # last_claim_time
            user_box.replace(24, op.itob(UInt64(0)))       # total_claimed
            # Store NFT as (collection_app_id, token_index) pair at offset 32
            user_box.replace(32, op.itob(collection_app_id))
            user_box.replace(40, op.itob(token_index))
        else:
            # Existing staker — auto-claim first, then add NFT
            self._do_claim_rewards()
            nft_count = op.btoi(user_box.extract(0, 8))
            assert nft_count < UInt64(MAX_NFTS), "Max NFTs reached"
            offset = UInt64(32) + nft_count * UInt64(16)
            user_box.replace(offset, op.itob(collection_app_id))
            user_box.replace(offset + UInt64(8), op.itob(token_index))
            user_box.replace(0, op.itob(nft_count + UInt64(1)))

        self.total_nfts_staked += UInt64(1)

    # ── Unstaking ─────────────────────────────────────────────────────

    @arc4.abimethod()
    def unstake_nft(self, collection_app_id: UInt64, token_index: UInt64) -> None:
        user_box = Box(Bytes, key=Txn.sender.bytes)
        assert user_box, "No stake found"

        nft_count = op.btoi(user_box.extract(0, 8))
        assert nft_count > UInt64(0), "No NFTs staked"

        # Check lock period
        first_stake = op.btoi(user_box.extract(8, 8))
        elapsed_since_stake = Global.latest_timestamp - first_stake
        if self.lock_period:
            assert elapsed_since_stake >= self.lock_period, "Lock period not met"

        # Find the NFT in the user's list (16 bytes per entry)
        found_idx = UInt64(0)
        found = UInt64(0)
        for idx in urange(nft_count):
            offset = UInt64(32) + idx * UInt64(16)
            stored_app = op.btoi(user_box.extract(offset, UInt64(8)))
            stored_token = op.btoi(user_box.extract(offset + UInt64(8), UInt64(8)))
            if stored_app == collection_app_id and stored_token == token_index:
                found_idx = idx
                found = UInt64(1)
                break
        assert found, "NFT not found in stake"

        # Auto-claim rewards before unstaking
        self._do_claim_rewards()

        # Swap with last and decrement count
        new_count = nft_count - UInt64(1)
        if found_idx < new_count:
            last_offset = UInt64(32) + new_count * UInt64(16)
            last_entry = user_box.extract(last_offset, UInt64(16))
            found_offset = UInt64(32) + found_idx * UInt64(16)
            user_box.replace(found_offset, last_entry)
        # Zero out the last slot
        zero_offset = UInt64(32) + new_count * UInt64(16)
        user_box.replace(zero_offset, op.itob(UInt64(0)))
        user_box.replace(zero_offset + UInt64(8), op.itob(UInt64(0)))
        user_box.replace(0, op.itob(new_count))

        # Return NFT to user via inner arc72_transferFrom
        _arc72_transfer_from(collection_app_id, Global.current_application_address, Txn.sender, token_index)

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
            self._send_reward(reward)
            self.total_reward_balance -= reward
            self.total_rewards_claimed += reward

            # Update user total_claimed
            prev_claimed = op.btoi(user_box.extract(24, 8))
            user_box.replace(24, op.itob(prev_claimed + reward))

        # Update last_claim_time
        user_box.replace(16, op.itob(now))

    # ── Internal: reward distribution ─────────────────────────────────

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

    # ── Internal: collection verification ─────────────────────────────

    @subroutine
    def _verify_collection(self, collection_app_id: UInt64, token_index: UInt64) -> None:
        mode = self.collection_mode

        if mode == UInt64(0):
            # Collection app ID mode — NFT must belong to the specified ARC-72 app
            assert collection_app_id == self.collection_app, "Wrong collection"
        elif mode == UInt64(1):
            # Whitelist mode
            assert _is_in_whitelist(collection_app_id, token_index), "NFT not whitelisted"
        elif mode == UInt64(2):
            # Both: collection app match OR whitelist
            app_match = collection_app_id == self.collection_app
            wl_match = _is_in_whitelist(collection_app_id, token_index)
            assert app_match or wl_match, "NFT not in collection"


# ── Subroutines ──────────────────────────────────────────────────────


@subroutine
def _is_in_whitelist(collection_app_id: UInt64, token_index: UInt64) -> bool:
    wl = Box(Bytes, key=b"wl")
    if not wl:
        return False
    count = wl.length // UInt64(16)
    for idx in urange(count):
        offset = idx * UInt64(16)
        stored_app = op.btoi(wl.extract(offset, UInt64(8)))
        stored_token = op.btoi(wl.extract(offset + UInt64(8), UInt64(8)))
        if stored_app == collection_app_id and stored_token == token_index:
            return True
    return False


@subroutine
def _arc72_transfer_from(
    collection_app_id: UInt64, from_addr: Account, to_addr: Account, token_index: UInt64
) -> None:
    """Call arc72_transferFrom(address,address,uint256) on an ARC-72 contract via inner txn.

    ABI encoding: 4-byte selector + 32-byte from_addr + 32-byte to_addr + 32-byte uint256 token_index
    """
    # uint256 token_index: pad to 32 bytes (24 zero bytes + 8-byte big-endian)
    token_bytes = Bytes(b"\x00" * 24) + op.itob(token_index)
    args = from_addr.bytes + to_addr.bytes + token_bytes

    itxn.ApplicationCall(
        app_id=Application(collection_app_id),
        app_args=(ARC72_TRANSFER_SEL, args),
        accounts=(from_addr, to_addr),
        fee=0,
    ).submit()


@subroutine
def _arc200_transfer(token_app: UInt64, receiver: Account, amount: UInt64) -> None:
    """Call arc200_transfer(address,uint256)bool on an ARC-200 contract via inner txn."""
    amount_bytes = Bytes(b"\x00" * 24) + op.itob(amount)
    args = receiver.bytes + amount_bytes

    itxn.ApplicationCall(
        app_id=Application(token_app),
        app_args=(ARC200_TRANSFER_SEL, args),
        fee=0,
    ).submit()


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
