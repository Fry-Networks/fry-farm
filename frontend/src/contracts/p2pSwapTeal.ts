/**
 * P2P Swap TEAL source code for on-chain compilation.
 * Source: /opt/fry-farm/contracts/fry_p2p_swap/
 * 
 * The frontend compiles these via algod.compile() before deployment.
 * Algorand mainnet uses v11, Voi uses v10 (same code, different pragma).
 */

/** Approval program TEAL source (AVM v11) */
export const P2P_APPROVAL_TEAL = `#pragma version 11
#pragma typetrack false

// algopy.arc4.ARC4Contract.approval_program() -> uint64:
main:
    intcblock 0 1 8 32 47300
    bytecblock "active_offer_count" "escrowed_algo" "offer_asset_id" "is_active" "creator" "fee_recipient" "next_offer_id" "total_offers_created" "fee_bps" 0x0000000000000000000000000000000000000000000000000000000000000000 "request_asset_id" 0x151f7c75
    // contract.py:39
    // class FryP2PSwap(ARC4Contract):
    txn OnCompletion
    !
    assert
    txn ApplicationID
    bz main_create_NoOp@17
    pushbytess 0x00134a11 0x820b5a32 0x2db8cba4 0xa2d6fcae 0x9135c6b8 0x2fda5e1e 0x206d600e 0x865bcbb4 0x571bf70a 0x00d30bac 0x0178f94b 0x242d58ab 0x6515fb26 // method "opt_in_asset(uint64,pay)void", method "create_offer_asa(axfer,pay,uint64,address,uint64)uint64", method "create_offer_algo(pay,pay,uint64,uint64,address,uint64)uint64", method "accept_offer_asa(uint64,axfer)void", method "accept_offer_algo(uint64,pay)void", method "update_offer(uint64,uint64)void", method "cancel_offer(uint64)void", method "reclaim_expired(uint64)void", method "update_fee(uint64)void", method "update_fee_recipient(address)void", method "pause()void", method "resume()void", method "withdraw_excess_mbr(uint64)void"
    txna ApplicationArgs 0
    match opt_in_asset create_offer_asa create_offer_algo accept_offer_asa accept_offer_algo update_offer cancel_offer reclaim_expired update_fee update_fee_recipient pause resume withdraw_excess_mbr
    err

main_create_NoOp@17:
    // contract.py:39
    // class FryP2PSwap(ARC4Contract):
    pushbytes 0x3a7d98cd // method "init(address,uint64,uint64,uint64)void"
    txna ApplicationArgs 0
    match init
    err


// fry_p2p_swap.contract._calc_fee(amount: uint64, fee_bps: uint64) -> uint64:
_calc_fee:
    // contract.py:548-549
    // @subroutine
    // def _calc_fee(amount: UInt64, fee_bps: UInt64) -> UInt64:
    proto 2 1
    // contract.py:552
    // if not fee_bps:
    frame_dig -1
    bnz _calc_fee_after_if_else@2
    // contract.py:553
    // return UInt64(0)
    intc_0 // 0
    retsub

_calc_fee_after_if_else@2:
    // contract.py:554
    // h, l = op.mulw(amount, fee_bps)
    frame_dig -2
    frame_dig -1
    mulw
    // contract.py:555
    // qh, ql, _rh, _rl = op.divmodw(h, l, UInt64(0), UInt64(10000))
    intc_0 // 0
    pushint 10000
    divmodw
    popn 2
    swap
    // contract.py:556
    // assert not qh, "Fee overflow"
    !
    assert // Fee overflow
    // contract.py:557
    // return ql
    retsub


// fry_p2p_swap.contract.FryP2PSwap.init[routing]() -> void:
init:
    // contract.py:56
    // @arc4.abimethod(create="require")
    txna ApplicationArgs 1
    dup
    len
    intc_3 // 32
    ==
    assert // invalid number of bytes for arc4.static_array<arc4.uint8, 32>
    txna ApplicationArgs 2
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    txna ApplicationArgs 3
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    txna ApplicationArgs 4
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    // contract.py:64
    // assert fee_bps <= UInt64(1000), "Fee cannot exceed 10%"
    dig 2
    pushint 1000
    <=
    assert // Fee cannot exceed 10%
    // contract.py:65
    // assert offer_asset_id != request_asset_id, "Asset pair must be different"
    dup2
    !=
    assert // Asset pair must be different
    // contract.py:67
    // self.creator = Txn.sender
    bytec 4 // "creator"
    txn Sender
    app_global_put
    // contract.py:68
    // self.fee_recipient = fee_recipient
    bytec 5 // "fee_recipient"
    uncover 4
    app_global_put
    // contract.py:69
    // self.fee_bps = fee_bps
    bytec 8 // "fee_bps"
    uncover 3
    app_global_put
    // contract.py:70
    // self.offer_asset_id = offer_asset_id
    bytec_2 // "offer_asset_id"
    uncover 2
    app_global_put
    // contract.py:71
    // self.request_asset_id = request_asset_id
    bytec 10 // "request_asset_id"
    swap
    app_global_put
    // contract.py:72
    // self.next_offer_id = UInt64(1)
    bytec 6 // "next_offer_id"
    intc_1 // 1
    app_global_put
    // contract.py:73
    // self.total_offers_created = UInt64(0)
    bytec 7 // "total_offers_created"
    intc_0 // 0
    app_global_put
    // contract.py:74
    // self.active_offer_count = UInt64(0)
    bytec_0 // "active_offer_count"
    intc_0 // 0
    app_global_put
    // contract.py:75
    // self.is_active = UInt64(1)
    bytec_3 // "is_active"
    intc_1 // 1
    app_global_put
    // contract.py:76
    // self.escrowed_algo = UInt64(0)
    bytec_1 // "escrowed_algo"
    intc_0 // 0
    app_global_put
    // contract.py:56
    // @arc4.abimethod(create="require")
    intc_1 // 1
    return


// fry_p2p_swap.contract.FryP2PSwap.opt_in_asset[routing]() -> void:
opt_in_asset:
    // contract.py:80
    // @arc4.abimethod()
    txna ApplicationArgs 1
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    txn GroupIndex
    intc_1 // 1
    -
    dup
    gtxns TypeEnum
    intc_1 // pay
    ==
    assert // transaction type is pay
    // contract.py:88
    // assert asset, "Cannot opt into native token"
    dig 1
    assert // Cannot opt into native token
    // contract.py:89
    // assert mbr_payment.receiver == Global.current_application_address
    gtxns Receiver
    global CurrentApplicationAddress
    ==
    assert
    // contract.py:91-96
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(asset),
    //     asset_receiver=Global.current_application_address,
    //     asset_amount=0,
    //     fee=0,
    // ).submit()
    itxn_begin
    // contract.py:93
    // asset_receiver=Global.current_application_address,
    global CurrentApplicationAddress
    // contract.py:94
    // asset_amount=0,
    intc_0 // 0
    itxn_field AssetAmount
    itxn_field AssetReceiver
    itxn_field XferAsset
    // contract.py:91
    // itxn.AssetTransfer(
    pushint 4 // axfer
    itxn_field TypeEnum
    // contract.py:95
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:91-96
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(asset),
    //     asset_receiver=Global.current_application_address,
    //     asset_amount=0,
    //     fee=0,
    // ).submit()
    itxn_submit
    // contract.py:80
    // @arc4.abimethod()
    intc_1 // 1
    return


// fry_p2p_swap.contract.FryP2PSwap.create_offer_asa[routing]() -> void:
create_offer_asa:
    // contract.py:100
    // @arc4.abimethod()
    txn GroupIndex
    pushint 2
    -
    dup
    gtxns TypeEnum
    pushint 4 // axfer
    ==
    assert // transaction type is axfer
    txn GroupIndex
    intc_1 // 1
    -
    dup
    gtxns TypeEnum
    intc_1 // pay
    ==
    assert // transaction type is pay
    txna ApplicationArgs 1
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    dup
    cover 3
    txna ApplicationArgs 2
    dup
    cover 4
    len
    intc_3 // 32
    ==
    assert // invalid number of bytes for arc4.static_array<arc4.uint8, 32>
    txna ApplicationArgs 3
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    dup
    cover 2
    cover 4
    // contract.py:110
    // assert self.is_active == UInt64(1), "Contract paused"
    intc_0 // 0
    bytec_3 // "is_active"
    app_global_get_ex
    assert // check self.is_active exists
    intc_1 // 1
    ==
    assert // Contract paused
    // contract.py:111
    // assert self.offer_asset_id, "This market's offer asset is native, use create_offer_algo"
    intc_0 // 0
    bytec_2 // "offer_asset_id"
    app_global_get_ex
    assert // check self.offer_asset_id exists
    dup
    assert // This market's offer asset is native, use create_offer_algo
    // contract.py:112
    // assert request_amount, "Request amount must be positive"
    swap
    assert // Request amount must be positive
    // contract.py:114-115
    // # Validate escrow transfer
    // offer_amount = asset_transfer.asset_amount
    dig 3
    gtxns AssetAmount
    dup
    cover 5
    // contract.py:116
    // assert offer_amount, "Offer amount must be positive"
    assert // Offer amount must be positive
    // contract.py:117
    // assert asset_transfer.xfer_asset == Asset(self.offer_asset_id), "Wrong offer asset"
    dig 3
    gtxns XferAsset
    ==
    assert // Wrong offer asset
    // contract.py:118
    // assert asset_transfer.asset_receiver == Global.current_application_address
    uncover 2
    gtxns AssetReceiver
    global CurrentApplicationAddress
    ==
    assert
    // contract.py:120-121
    // # Validate box MBR payment
    // assert box_payment.receiver == Global.current_application_address
    dig 1
    gtxns Receiver
    global CurrentApplicationAddress
    ==
    assert
    // contract.py:122
    // assert box_payment.amount >= UInt64(OFFER_BOX_MBR), "Insufficient box MBR"
    swap
    gtxns Amount
    intc 4 // 47300
    >=
    assert // Insufficient box MBR
    // contract.py:124-125
    // # Validate expiry (minimum 5 minutes if set)
    // if expiry:
    bz create_offer_asa_after_if_else@3
    // contract.py:126
    // assert expiry >= Global.latest_timestamp + UInt64(MIN_EXPIRY_DURATION), "Expiry too soon (5 min minimum)"
    global LatestTimestamp
    pushint 300
    +
    dig 2
    <=
    assert // Expiry too soon (5 min minimum)

create_offer_asa_after_if_else@3:
    // contract.py:131
    // if cp_bytes != zero_addr:
    dig 2
    // contract.py:130
    // zero_addr = Bytes(b"\\x00" * 32)
    bytec 9 // 0x0000000000000000000000000000000000000000000000000000000000000000
    // contract.py:131
    // if cp_bytes != zero_addr:
    !=
    bz create_offer_asa_after_if_else@5
    // contract.py:132
    // assert cp_bytes != Txn.sender.bytes, "Cannot set self as counterparty"
    dig 2
    txn Sender
    !=
    assert // Cannot set self as counterparty

create_offer_asa_after_if_else@5:
    // contract.py:134-135
    // # Allocate offer ID
    // offer_id = self.next_offer_id
    intc_0 // 0
    bytec 6 // "next_offer_id"
    app_global_get_ex
    assert // check self.next_offer_id exists
    // contract.py:136
    // self.next_offer_id = offer_id + UInt64(1)
    dup
    intc_1 // 1
    +
    bytec 6 // "next_offer_id"
    swap
    app_global_put
    // contract.py:138-139
    // # Create box
    // offer_box = Box(Bytes, key=op.itob(offer_id))
    itob
    // contract.py:140
    // offer_box.create(size=UInt64(OFFER_BOX_SIZE))
    dup
    pushint 104
    box_create
    pop
    // contract.py:141
    // offer_box.replace(0, op.itob(UInt64(0)))  # status = open
    intc_0 // 0
    itob
    dig 1
    intc_0 // 0
    uncover 2
    box_replace
    // contract.py:142
    // offer_box.replace(8, Txn.sender.bytes)
    txn Sender
    dig 1
    intc_2 // 8
    uncover 2
    box_replace
    // contract.py:143
    // offer_box.replace(40, op.itob(offer_amount))
    dig 1
    itob
    dig 1
    pushint 40
    uncover 2
    box_replace
    // contract.py:144
    // offer_box.replace(48, op.itob(request_amount))
    dig 4
    itob
    dig 1
    pushint 48
    uncover 2
    box_replace
    // contract.py:145
    // offer_box.replace(56, cp_bytes)
    dup
    pushint 56
    dig 5
    box_replace
    // contract.py:146
    // offer_box.replace(88, op.itob(expiry))
    dig 2
    itob
    dig 1
    pushint 88
    uncover 2
    box_replace
    // contract.py:147
    // offer_box.replace(96, op.itob(Global.latest_timestamp))
    global LatestTimestamp
    itob
    dig 1
    pushint 96
    uncover 2
    box_replace
    // contract.py:149
    // self.total_offers_created += UInt64(1)
    intc_0 // 0
    bytec 7 // "total_offers_created"
    app_global_get_ex
    assert // check self.total_offers_created exists
    intc_1 // 1
    +
    bytec 7 // "total_offers_created"
    swap
    app_global_put
    // contract.py:150
    // self.active_offer_count += UInt64(1)
    intc_0 // 0
    bytec_0 // "active_offer_count"
    app_global_get_ex
    assert // check self.active_offer_count exists
    intc_1 // 1
    +
    bytec_0 // "active_offer_count"
    swap
    app_global_put
    // contract.py:100
    // @arc4.abimethod()
    bytec 11 // 0x151f7c75
    swap
    concat
    log
    intc_1 // 1
    return


// fry_p2p_swap.contract.FryP2PSwap.create_offer_algo[routing]() -> void:
create_offer_algo:
    // contract.py:156
    // @arc4.abimethod()
    txn GroupIndex
    pushint 2
    -
    dup
    gtxns TypeEnum
    intc_1 // pay
    ==
    assert // transaction type is pay
    txn GroupIndex
    intc_1 // 1
    -
    dup
    gtxns TypeEnum
    intc_1 // pay
    ==
    assert // transaction type is pay
    txna ApplicationArgs 1
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    dup
    cover 3
    txna ApplicationArgs 2
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    dup
    cover 4
    txna ApplicationArgs 3
    dup
    cover 5
    len
    intc_3 // 32
    ==
    assert // invalid number of bytes for arc4.static_array<arc4.uint8, 32>
    txna ApplicationArgs 4
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    dup
    cover 3
    cover 5
    // contract.py:167
    // assert self.is_active == UInt64(1), "Contract paused"
    intc_0 // 0
    bytec_3 // "is_active"
    app_global_get_ex
    assert // check self.is_active exists
    intc_1 // 1
    ==
    assert // Contract paused
    // contract.py:168
    // assert self.offer_asset_id == UInt64(0), "This market's offer asset is an ASA, use create_offer_asa"
    intc_0 // 0
    bytec_2 // "offer_asset_id"
    app_global_get_ex
    assert // check self.offer_asset_id exists
    !
    assert // This market's offer asset is an ASA, use create_offer_asa
    // contract.py:169
    // assert offer_amount, "Offer amount must be positive"
    dig 1
    assert // Offer amount must be positive
    // contract.py:170
    // assert request_amount, "Request amount must be positive"
    assert // Request amount must be positive
    // contract.py:172-173
    // # Validate escrow payment
    // assert offer_payment.receiver == Global.current_application_address
    dig 3
    gtxns Receiver
    global CurrentApplicationAddress
    ==
    assert
    // contract.py:174
    // assert offer_payment.amount == offer_amount, "Payment does not match offer amount"
    uncover 3
    gtxns Amount
    ==
    assert // Payment does not match offer amount
    // contract.py:176-177
    // # Validate box MBR payment
    // assert box_payment.receiver == Global.current_application_address
    dig 1
    gtxns Receiver
    global CurrentApplicationAddress
    ==
    assert
    // contract.py:178
    // assert box_payment.amount >= UInt64(OFFER_BOX_MBR), "Insufficient box MBR"
    swap
    gtxns Amount
    intc 4 // 47300
    >=
    assert // Insufficient box MBR
    // contract.py:180-181
    // # Validate expiry (minimum 5 minutes if set)
    // if expiry:
    bz create_offer_algo_after_if_else@3
    // contract.py:182
    // assert expiry >= Global.latest_timestamp + UInt64(MIN_EXPIRY_DURATION), "Expiry too soon (5 min minimum)"
    global LatestTimestamp
    pushint 300
    +
    dig 1
    <=
    assert // Expiry too soon (5 min minimum)

create_offer_algo_after_if_else@3:
    // contract.py:187
    // if cp_bytes != zero_addr:
    dig 1
    // contract.py:186
    // zero_addr = Bytes(b"\\x00" * 32)
    bytec 9 // 0x0000000000000000000000000000000000000000000000000000000000000000
    // contract.py:187
    // if cp_bytes != zero_addr:
    !=
    bz create_offer_algo_after_if_else@5
    // contract.py:188
    // assert cp_bytes != Txn.sender.bytes, "Cannot set self as counterparty"
    dig 1
    txn Sender
    !=
    assert // Cannot set self as counterparty

create_offer_algo_after_if_else@5:
    // contract.py:190-191
    // # Allocate offer ID
    // offer_id = self.next_offer_id
    intc_0 // 0
    bytec 6 // "next_offer_id"
    app_global_get_ex
    assert // check self.next_offer_id exists
    // contract.py:192
    // self.next_offer_id = offer_id + UInt64(1)
    dup
    intc_1 // 1
    +
    bytec 6 // "next_offer_id"
    swap
    app_global_put
    // contract.py:194-195
    // # Create box
    // offer_box = Box(Bytes, key=op.itob(offer_id))
    itob
    // contract.py:196
    // offer_box.create(size=UInt64(OFFER_BOX_SIZE))
    dup
    pushint 104
    box_create
    pop
    // contract.py:197
    // offer_box.replace(0, op.itob(UInt64(0)))  # status = open
    intc_0 // 0
    itob
    dig 1
    intc_0 // 0
    uncover 2
    box_replace
    // contract.py:198
    // offer_box.replace(8, Txn.sender.bytes)
    txn Sender
    dig 1
    intc_2 // 8
    uncover 2
    box_replace
    // contract.py:199
    // offer_box.replace(40, op.itob(offer_amount))
    dig 4
    dup
    cover 2
    itob
    dig 1
    pushint 40
    uncover 2
    box_replace
    // contract.py:200
    // offer_box.replace(48, op.itob(request_amount))
    dig 4
    itob
    dig 1
    pushint 48
    uncover 2
    box_replace
    // contract.py:201
    // offer_box.replace(56, cp_bytes)
    dup
    pushint 56
    dig 5
    box_replace
    // contract.py:202
    // offer_box.replace(88, op.itob(expiry))
    dig 2
    itob
    dig 1
    pushint 88
    uncover 2
    box_replace
    // contract.py:203
    // offer_box.replace(96, op.itob(Global.latest_timestamp))
    global LatestTimestamp
    itob
    dig 1
    pushint 96
    uncover 2
    box_replace
    // contract.py:205
    // self.total_offers_created += UInt64(1)
    intc_0 // 0
    bytec 7 // "total_offers_created"
    app_global_get_ex
    assert // check self.total_offers_created exists
    intc_1 // 1
    +
    bytec 7 // "total_offers_created"
    swap
    app_global_put
    // contract.py:206
    // self.active_offer_count += UInt64(1)
    intc_0 // 0
    bytec_0 // "active_offer_count"
    app_global_get_ex
    assert // check self.active_offer_count exists
    intc_1 // 1
    +
    bytec_0 // "active_offer_count"
    swap
    app_global_put
    // contract.py:207
    // self.escrowed_algo += offer_amount
    intc_0 // 0
    bytec_1 // "escrowed_algo"
    app_global_get_ex
    assert // check self.escrowed_algo exists
    uncover 2
    +
    bytec_1 // "escrowed_algo"
    swap
    app_global_put
    // contract.py:156
    // @arc4.abimethod()
    bytec 11 // 0x151f7c75
    swap
    concat
    log
    intc_1 // 1
    return


// fry_p2p_swap.contract.FryP2PSwap.accept_offer_asa[routing]() -> void:
accept_offer_asa:
    pushbytes ""
    // contract.py:213
    // @arc4.abimethod()
    txna ApplicationArgs 1
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    txn GroupIndex
    intc_1 // 1
    -
    dup
    cover 2
    gtxns TypeEnum
    pushint 4 // axfer
    ==
    assert // transaction type is axfer
    // contract.py:220
    // assert self.is_active == UInt64(1), "Contract paused"
    intc_0 // 0
    bytec_3 // "is_active"
    app_global_get_ex
    assert // check self.is_active exists
    intc_1 // 1
    ==
    assert // Contract paused
    // contract.py:221
    // assert self.request_asset_id, "This market uses native payment, use accept_offer_algo"
    intc_0 // 0
    bytec 10 // "request_asset_id"
    app_global_get_ex
    swap
    dup
    cover 2
    cover 3
    assert // check self.request_asset_id exists
    assert // This market uses native payment, use accept_offer_algo
    // contract.py:223
    // offer_box = Box(Bytes, key=op.itob(offer_id))
    itob
    dupn 2
    // contract.py:224
    // assert offer_box, "Offer not found"
    box_len
    bury 1
    assert // Offer not found
    // contract.py:226-227
    // # Read offer fields
    // status = op.btoi(offer_box.extract(0, 8))
    dup
    intc_0 // 0
    intc_2 // 8
    box_extract
    btoi
    // contract.py:228
    // maker_bytes = offer_box.extract(8, 32)
    dig 1
    intc_2 // 8
    intc_3 // 32
    box_extract
    cover 2
    // contract.py:229
    // offer_amount = op.btoi(offer_box.extract(40, 8))
    dig 1
    pushint 40
    intc_2 // 8
    box_extract
    btoi
    cover 2
    // contract.py:230
    // request_amount = op.btoi(offer_box.extract(48, 8))
    dig 1
    pushint 48
    intc_2 // 8
    box_extract
    btoi
    cover 2
    // contract.py:231
    // counterparty_bytes = offer_box.extract(56, 32)
    dig 1
    pushint 56
    intc_3 // 32
    box_extract
    cover 2
    // contract.py:232
    // expiry = op.btoi(offer_box.extract(88, 8))
    swap
    pushint 88
    intc_2 // 8
    box_extract
    btoi
    dup
    cover 2
    // contract.py:234-235
    // # Asset IDs from global state
    // offer_asset_id = self.offer_asset_id
    intc_0 // 0
    bytec_2 // "offer_asset_id"
    app_global_get_ex
    swap
    cover 3
    assert // check self.offer_asset_id exists
    // contract.py:238-239
    // # Checks
    // assert status == UInt64(0), "Offer not open"
    swap
    !
    assert // Offer not open
    // contract.py:240
    // if expiry:
    bz accept_offer_asa_after_if_else@3
    // contract.py:241
    // assert Global.latest_timestamp <= expiry, "Offer expired"
    global LatestTimestamp
    dig 2
    <=
    assert // Offer expired

accept_offer_asa_after_if_else@3:
    // contract.py:243
    // if counterparty_bytes != zero_addr:
    dig 2
    // contract.py:242
    // zero_addr = Bytes(b"\\x00" * 32)
    bytec 9 // 0x0000000000000000000000000000000000000000000000000000000000000000
    // contract.py:243
    // if counterparty_bytes != zero_addr:
    !=
    bz accept_offer_asa_after_if_else@5
    // contract.py:244
    // assert counterparty_bytes == Txn.sender.bytes, "Not authorized counterparty"
    dig 2
    txn Sender
    ==
    assert // Not authorized counterparty

accept_offer_asa_after_if_else@5:
    // contract.py:245
    // assert Txn.sender.bytes != maker_bytes, "Cannot accept own offer"
    txn Sender
    dig 6
    !=
    assert // Cannot accept own offer
    // contract.py:247-248
    // # Validate taker's ASA transfer
    // assert taker_transfer.xfer_asset == Asset(request_asset_id), "Wrong asset"
    dig 8
    dup
    gtxns XferAsset
    dig 9
    ==
    assert // Wrong asset
    // contract.py:249
    // assert taker_transfer.asset_amount == request_amount, "Wrong amount"
    dup
    gtxns AssetAmount
    dig 5
    ==
    assert // Wrong amount
    // contract.py:250
    // assert taker_transfer.asset_receiver == Global.current_application_address
    gtxns AssetReceiver
    global CurrentApplicationAddress
    ==
    assert
    // contract.py:252-253
    // # EFFECTS: mark as filled BEFORE interactions
    // offer_box.replace(0, op.itob(UInt64(1)))  # status = filled
    intc_1 // 1
    itob
    dig 7
    intc_0 // 0
    uncover 2
    box_replace
    // contract.py:255-256
    // # Calculate taker fee (on offer asset only, maker gets full request_amount)
    // fee = _calc_fee(offer_amount, self.fee_bps)
    intc_0 // 0
    bytec 8 // "fee_bps"
    app_global_get_ex
    assert // check self.fee_bps exists
    dig 5
    dup
    uncover 2
    callsub _calc_fee
    dup
    bury 12
    // contract.py:257
    // taker_receives = offer_amount - fee
    -
    // contract.py:259-260
    // # INTERACTIONS: send escrowed offer asset to taker
    // if offer_asset_id:
    dig 1
    bz accept_offer_asa_else_body@8
    // contract.py:261-266
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(offer_asset_id),
    //     asset_receiver=Txn.sender,
    //     asset_amount=taker_receives,
    //     fee=0,
    // ).submit()
    itxn_begin
    // contract.py:263
    // asset_receiver=Txn.sender,
    txn Sender
    itxn_field AssetReceiver
    itxn_field AssetAmount
    dup
    itxn_field XferAsset
    // contract.py:261
    // itxn.AssetTransfer(
    pushint 4 // axfer
    itxn_field TypeEnum
    // contract.py:265
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:261-266
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(offer_asset_id),
    //     asset_receiver=Txn.sender,
    //     asset_amount=taker_receives,
    //     fee=0,
    // ).submit()
    itxn_submit

accept_offer_asa_after_if_else@10:
    // contract.py:275-276
    // # Send taker's full payment to maker (zero deduction)
    // maker_account = Account(maker_bytes)
    dig 5
    dup
    len
    intc_3 // 32
    ==
    assert // Address length is 32 bytes
    // contract.py:277-282
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(request_asset_id),
    //     asset_receiver=maker_account,
    //     asset_amount=request_amount,
    //     fee=0,
    // ).submit()
    itxn_begin
    dig 4
    itxn_field AssetAmount
    itxn_field AssetReceiver
    dig 7
    itxn_field XferAsset
    // contract.py:277
    // itxn.AssetTransfer(
    pushint 4 // axfer
    itxn_field TypeEnum
    // contract.py:281
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:277-282
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(request_asset_id),
    //     asset_receiver=maker_account,
    //     asset_amount=request_amount,
    //     fee=0,
    // ).submit()
    itxn_submit
    // contract.py:284-285
    // # Send fee to fee_recipient (if any)
    // if fee:
    dig 9
    bz accept_offer_asa_after_if_else@18
    // contract.py:286
    // if offer_asset_id:
    dup
    bz accept_offer_asa_else_body@15
    // contract.py:287-292
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(offer_asset_id),
    //     asset_receiver=self.fee_recipient,
    //     asset_amount=fee,
    //     fee=0,
    // ).submit()
    itxn_begin
    // contract.py:289
    // asset_receiver=self.fee_recipient,
    intc_0 // 0
    bytec 5 // "fee_recipient"
    app_global_get_ex
    assert // check self.fee_recipient exists
    dig 10
    itxn_field AssetAmount
    itxn_field AssetReceiver
    dup
    itxn_field XferAsset
    // contract.py:287
    // itxn.AssetTransfer(
    pushint 4 // axfer
    itxn_field TypeEnum
    // contract.py:291
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:287-292
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(offer_asset_id),
    //     asset_receiver=self.fee_recipient,
    //     asset_amount=fee,
    //     fee=0,
    // ).submit()
    itxn_submit

accept_offer_asa_after_if_else@18:
    // contract.py:300-301
    // # Cleanup
    // del offer_box.value
    dig 6
    box_del
    pop
    // contract.py:302
    // self.active_offer_count -= UInt64(1)
    intc_0 // 0
    bytec_0 // "active_offer_count"
    app_global_get_ex
    assert // check self.active_offer_count exists
    intc_1 // 1
    -
    bytec_0 // "active_offer_count"
    swap
    app_global_put
    // contract.py:213
    // @arc4.abimethod()
    intc_1 // 1
    return

accept_offer_asa_else_body@15:
    // contract.py:294-298
    // itxn.Payment(
    //     receiver=self.fee_recipient,
    //     amount=fee,
    //     fee=0,
    // ).submit()
    itxn_begin
    // contract.py:295
    // receiver=self.fee_recipient,
    intc_0 // 0
    bytec 5 // "fee_recipient"
    app_global_get_ex
    assert // check self.fee_recipient exists
    dig 10
    itxn_field Amount
    itxn_field Receiver
    // contract.py:294
    // itxn.Payment(
    intc_1 // pay
    itxn_field TypeEnum
    // contract.py:297
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:294-298
    // itxn.Payment(
    //     receiver=self.fee_recipient,
    //     amount=fee,
    //     fee=0,
    // ).submit()
    itxn_submit
    b accept_offer_asa_after_if_else@18

accept_offer_asa_else_body@8:
    // contract.py:268-272
    // itxn.Payment(
    //     receiver=Txn.sender,
    //     amount=taker_receives,
    //     fee=0,
    // ).submit()
    itxn_begin
    // contract.py:269
    // receiver=Txn.sender,
    txn Sender
    itxn_field Receiver
    itxn_field Amount
    // contract.py:268
    // itxn.Payment(
    intc_1 // pay
    itxn_field TypeEnum
    // contract.py:271
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:268-272
    // itxn.Payment(
    //     receiver=Txn.sender,
    //     amount=taker_receives,
    //     fee=0,
    // ).submit()
    itxn_submit
    // contract.py:273
    // self.escrowed_algo -= offer_amount
    intc_0 // 0
    bytec_1 // "escrowed_algo"
    app_global_get_ex
    assert // check self.escrowed_algo exists
    dig 5
    -
    bytec_1 // "escrowed_algo"
    swap
    app_global_put
    b accept_offer_asa_after_if_else@10


// fry_p2p_swap.contract.FryP2PSwap.accept_offer_algo[routing]() -> void:
accept_offer_algo:
    pushbytes ""
    // contract.py:306
    // @arc4.abimethod()
    txna ApplicationArgs 1
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    txn GroupIndex
    intc_1 // 1
    -
    dup
    cover 2
    gtxns TypeEnum
    intc_1 // pay
    ==
    assert // transaction type is pay
    // contract.py:313
    // assert self.is_active == UInt64(1), "Contract paused"
    intc_0 // 0
    bytec_3 // "is_active"
    app_global_get_ex
    assert // check self.is_active exists
    intc_1 // 1
    ==
    assert // Contract paused
    // contract.py:314
    // assert self.request_asset_id == UInt64(0), "This market uses ASA payment, use accept_offer_asa"
    intc_0 // 0
    bytec 10 // "request_asset_id"
    app_global_get_ex
    assert // check self.request_asset_id exists
    !
    assert // This market uses ASA payment, use accept_offer_asa
    // contract.py:316
    // offer_box = Box(Bytes, key=op.itob(offer_id))
    itob
    dupn 2
    // contract.py:317
    // assert offer_box, "Offer not found"
    box_len
    bury 1
    assert // Offer not found
    // contract.py:319-320
    // # Read offer fields
    // status = op.btoi(offer_box.extract(0, 8))
    dup
    intc_0 // 0
    intc_2 // 8
    box_extract
    btoi
    // contract.py:321
    // maker_bytes = offer_box.extract(8, 32)
    dig 1
    intc_2 // 8
    intc_3 // 32
    box_extract
    cover 2
    // contract.py:322
    // offer_amount = op.btoi(offer_box.extract(40, 8))
    dig 1
    pushint 40
    intc_2 // 8
    box_extract
    btoi
    cover 2
    // contract.py:323
    // request_amount = op.btoi(offer_box.extract(48, 8))
    dig 1
    pushint 48
    intc_2 // 8
    box_extract
    btoi
    cover 2
    // contract.py:324
    // counterparty_bytes = offer_box.extract(56, 32)
    dig 1
    pushint 56
    intc_3 // 32
    box_extract
    cover 2
    // contract.py:325
    // expiry = op.btoi(offer_box.extract(88, 8))
    swap
    pushint 88
    intc_2 // 8
    box_extract
    btoi
    dup
    cover 2
    // contract.py:327-328
    // # Asset IDs from global state
    // offer_asset_id = self.offer_asset_id
    intc_0 // 0
    bytec_2 // "offer_asset_id"
    app_global_get_ex
    swap
    cover 3
    assert // check self.offer_asset_id exists
    // contract.py:330-331
    // # Checks
    // assert status == UInt64(0), "Offer not open"
    swap
    !
    assert // Offer not open
    // contract.py:332
    // if expiry:
    bz accept_offer_algo_after_if_else@3
    // contract.py:333
    // assert Global.latest_timestamp <= expiry, "Offer expired"
    global LatestTimestamp
    dig 2
    <=
    assert // Offer expired

accept_offer_algo_after_if_else@3:
    // contract.py:335
    // if counterparty_bytes != zero_addr:
    dig 2
    // contract.py:334
    // zero_addr = Bytes(b"\\x00" * 32)
    bytec 9 // 0x0000000000000000000000000000000000000000000000000000000000000000
    // contract.py:335
    // if counterparty_bytes != zero_addr:
    !=
    bz accept_offer_algo_after_if_else@5
    // contract.py:336
    // assert counterparty_bytes == Txn.sender.bytes, "Not authorized counterparty"
    dig 2
    txn Sender
    ==
    assert // Not authorized counterparty

accept_offer_algo_after_if_else@5:
    // contract.py:337
    // assert Txn.sender.bytes != maker_bytes, "Cannot accept own offer"
    txn Sender
    dig 6
    !=
    assert // Cannot accept own offer
    // contract.py:339-340
    // # Validate taker's native payment
    // assert taker_payment.amount == request_amount, "Wrong amount"
    dig 7
    dup
    gtxns Amount
    dig 5
    ==
    assert // Wrong amount
    // contract.py:341
    // assert taker_payment.receiver == Global.current_application_address
    gtxns Receiver
    global CurrentApplicationAddress
    ==
    assert
    // contract.py:343-344
    // # EFFECTS: mark as filled BEFORE interactions
    // offer_box.replace(0, op.itob(UInt64(1)))  # status = filled
    intc_1 // 1
    itob
    dig 7
    intc_0 // 0
    uncover 2
    box_replace
    // contract.py:346-347
    // # Calculate taker fee (on offer asset only, maker gets full request_amount)
    // fee = _calc_fee(offer_amount, self.fee_bps)
    intc_0 // 0
    bytec 8 // "fee_bps"
    app_global_get_ex
    assert // check self.fee_bps exists
    dig 5
    dup
    uncover 2
    callsub _calc_fee
    dup
    bury 11
    // contract.py:348
    // taker_receives = offer_amount - fee
    -
    // contract.py:350-351
    // # INTERACTIONS: send escrowed offer asset to taker
    // if offer_asset_id:
    dig 1
    bz accept_offer_algo_else_body@8
    // contract.py:352-357
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(offer_asset_id),
    //     asset_receiver=Txn.sender,
    //     asset_amount=taker_receives,
    //     fee=0,
    // ).submit()
    itxn_begin
    // contract.py:354
    // asset_receiver=Txn.sender,
    txn Sender
    itxn_field AssetReceiver
    itxn_field AssetAmount
    dup
    itxn_field XferAsset
    // contract.py:352
    // itxn.AssetTransfer(
    pushint 4 // axfer
    itxn_field TypeEnum
    // contract.py:356
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:352-357
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(offer_asset_id),
    //     asset_receiver=Txn.sender,
    //     asset_amount=taker_receives,
    //     fee=0,
    // ).submit()
    itxn_submit

accept_offer_algo_after_if_else@10:
    // contract.py:366-367
    // # Send taker's full payment to maker (zero deduction)
    // maker_account = Account(maker_bytes)
    dig 5
    dup
    len
    intc_3 // 32
    ==
    assert // Address length is 32 bytes
    // contract.py:368-372
    // itxn.Payment(
    //     receiver=maker_account,
    //     amount=request_amount,
    //     fee=0,
    // ).submit()
    itxn_begin
    dig 4
    itxn_field Amount
    itxn_field Receiver
    // contract.py:368
    // itxn.Payment(
    intc_1 // pay
    itxn_field TypeEnum
    // contract.py:371
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:368-372
    // itxn.Payment(
    //     receiver=maker_account,
    //     amount=request_amount,
    //     fee=0,
    // ).submit()
    itxn_submit
    // contract.py:374-375
    // # Send fee to fee_recipient (if any)
    // if fee:
    dig 8
    bz accept_offer_algo_after_if_else@18
    // contract.py:376
    // if offer_asset_id:
    dup
    bz accept_offer_algo_else_body@15
    // contract.py:377-382
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(offer_asset_id),
    //     asset_receiver=self.fee_recipient,
    //     asset_amount=fee,
    //     fee=0,
    // ).submit()
    itxn_begin
    // contract.py:379
    // asset_receiver=self.fee_recipient,
    intc_0 // 0
    bytec 5 // "fee_recipient"
    app_global_get_ex
    assert // check self.fee_recipient exists
    dig 9
    itxn_field AssetAmount
    itxn_field AssetReceiver
    dup
    itxn_field XferAsset
    // contract.py:377
    // itxn.AssetTransfer(
    pushint 4 // axfer
    itxn_field TypeEnum
    // contract.py:381
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:377-382
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(offer_asset_id),
    //     asset_receiver=self.fee_recipient,
    //     asset_amount=fee,
    //     fee=0,
    // ).submit()
    itxn_submit

accept_offer_algo_after_if_else@18:
    // contract.py:390-391
    // # Cleanup
    // del offer_box.value
    dig 6
    box_del
    pop
    // contract.py:392
    // self.active_offer_count -= UInt64(1)
    intc_0 // 0
    bytec_0 // "active_offer_count"
    app_global_get_ex
    assert // check self.active_offer_count exists
    intc_1 // 1
    -
    bytec_0 // "active_offer_count"
    swap
    app_global_put
    // contract.py:306
    // @arc4.abimethod()
    intc_1 // 1
    return

accept_offer_algo_else_body@15:
    // contract.py:384-388
    // itxn.Payment(
    //     receiver=self.fee_recipient,
    //     amount=fee,
    //     fee=0,
    // ).submit()
    itxn_begin
    // contract.py:385
    // receiver=self.fee_recipient,
    intc_0 // 0
    bytec 5 // "fee_recipient"
    app_global_get_ex
    assert // check self.fee_recipient exists
    dig 9
    itxn_field Amount
    itxn_field Receiver
    // contract.py:384
    // itxn.Payment(
    intc_1 // pay
    itxn_field TypeEnum
    // contract.py:387
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:384-388
    // itxn.Payment(
    //     receiver=self.fee_recipient,
    //     amount=fee,
    //     fee=0,
    // ).submit()
    itxn_submit
    b accept_offer_algo_after_if_else@18

accept_offer_algo_else_body@8:
    // contract.py:359-363
    // itxn.Payment(
    //     receiver=Txn.sender,
    //     amount=taker_receives,
    //     fee=0,
    // ).submit()
    itxn_begin
    // contract.py:360
    // receiver=Txn.sender,
    txn Sender
    itxn_field Receiver
    itxn_field Amount
    // contract.py:359
    // itxn.Payment(
    intc_1 // pay
    itxn_field TypeEnum
    // contract.py:362
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:359-363
    // itxn.Payment(
    //     receiver=Txn.sender,
    //     amount=taker_receives,
    //     fee=0,
    // ).submit()
    itxn_submit
    // contract.py:364
    // self.escrowed_algo -= offer_amount
    intc_0 // 0
    bytec_1 // "escrowed_algo"
    app_global_get_ex
    assert // check self.escrowed_algo exists
    dig 5
    -
    bytec_1 // "escrowed_algo"
    swap
    app_global_put
    b accept_offer_algo_after_if_else@10


// fry_p2p_swap.contract.FryP2PSwap.update_offer[routing]() -> void:
update_offer:
    // contract.py:396
    // @arc4.abimethod()
    txna ApplicationArgs 1
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    txna ApplicationArgs 2
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    // contract.py:403
    // assert new_request_amount, "Request amount must be positive"
    dup
    assert // Request amount must be positive
    // contract.py:405
    // offer_box = Box(Bytes, key=op.itob(offer_id))
    swap
    itob
    // contract.py:406
    // assert offer_box, "Offer not found"
    dup
    box_len
    bury 1
    assert // Offer not found
    // contract.py:408
    // status = op.btoi(offer_box.extract(0, 8))
    dup
    intc_0 // 0
    intc_2 // 8
    box_extract
    btoi
    // contract.py:409
    // maker_bytes = offer_box.extract(8, 32)
    dig 1
    intc_2 // 8
    intc_3 // 32
    box_extract
    // contract.py:411
    // assert status == UInt64(0), "Offer not open"
    swap
    !
    assert // Offer not open
    // contract.py:412
    // assert Txn.sender.bytes == maker_bytes, "Only maker can update"
    txn Sender
    ==
    assert // Only maker can update
    // contract.py:414-415
    // # Update request_amount at offset 48
    // offer_box.replace(48, op.itob(new_request_amount))
    swap
    itob
    pushint 48
    swap
    box_replace
    // contract.py:396
    // @arc4.abimethod()
    intc_1 // 1
    return


// fry_p2p_swap.contract.FryP2PSwap.cancel_offer[routing]() -> void:
cancel_offer:
    // contract.py:419
    // @arc4.abimethod()
    txna ApplicationArgs 1
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    // contract.py:425
    // offer_box = Box(Bytes, key=op.itob(offer_id))
    itob
    dupn 2
    // contract.py:426
    // assert offer_box, "Offer not found"
    box_len
    bury 1
    assert // Offer not found
    // contract.py:428
    // status = op.btoi(offer_box.extract(0, 8))
    dup
    intc_0 // 0
    intc_2 // 8
    box_extract
    btoi
    // contract.py:429
    // maker_bytes = offer_box.extract(8, 32)
    dig 1
    intc_2 // 8
    intc_3 // 32
    box_extract
    dup
    cover 3
    cover 3
    // contract.py:430
    // offer_amount = op.btoi(offer_box.extract(40, 8))
    dig 1
    pushint 40
    intc_2 // 8
    box_extract
    btoi
    cover 4
    // contract.py:432
    // assert status == UInt64(0), "Offer not open"
    !
    assert // Offer not open
    // contract.py:433
    // assert Txn.sender.bytes == maker_bytes, "Only maker can cancel"
    txn Sender
    dig 2
    ==
    assert // Only maker can cancel
    // contract.py:435-436
    // # EFFECTS: mark as cancelled BEFORE interactions
    // offer_box.replace(0, op.itob(UInt64(2)))  # status = cancelled
    pushint 2
    itob
    intc_0 // 0
    swap
    box_replace
    // contract.py:438-439
    // # Return escrowed assets to maker
    // offer_asset_id = self.offer_asset_id
    intc_0 // 0
    bytec_2 // "offer_asset_id"
    app_global_get_ex
    swap
    dup
    cover 2
    cover 5
    assert // check self.offer_asset_id exists
    // contract.py:440
    // maker_account = Account(maker_bytes)
    swap
    len
    intc_3 // 32
    ==
    assert // Address length is 32 bytes
    // contract.py:441
    // if offer_asset_id:
    bz cancel_offer_else_body@4
    // contract.py:442-447
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(offer_asset_id),
    //     asset_receiver=maker_account,
    //     asset_amount=offer_amount,
    //     fee=0,
    // ).submit()
    itxn_begin
    itxn_field AssetReceiver
    itxn_field AssetAmount
    dup
    itxn_field XferAsset
    // contract.py:442
    // itxn.AssetTransfer(
    pushint 4 // axfer
    itxn_field TypeEnum
    // contract.py:446
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:442-447
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(offer_asset_id),
    //     asset_receiver=maker_account,
    //     asset_amount=offer_amount,
    //     fee=0,
    // ).submit()
    itxn_submit

cancel_offer_after_if_else@6:
    // contract.py:456-457
    // # Cleanup
    // del offer_box.value
    dig 1
    box_del
    pop
    // contract.py:458
    // self.active_offer_count -= UInt64(1)
    intc_0 // 0
    bytec_0 // "active_offer_count"
    app_global_get_ex
    assert // check self.active_offer_count exists
    intc_1 // 1
    -
    bytec_0 // "active_offer_count"
    swap
    app_global_put
    // contract.py:419
    // @arc4.abimethod()
    intc_1 // 1
    return

cancel_offer_else_body@4:
    // contract.py:449-453
    // itxn.Payment(
    //     receiver=maker_account,
    //     amount=offer_amount,
    //     fee=0,
    // ).submit()
    itxn_begin
    swap
    dup
    itxn_field Amount
    swap
    itxn_field Receiver
    // contract.py:449
    // itxn.Payment(
    intc_1 // pay
    itxn_field TypeEnum
    // contract.py:452
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:449-453
    // itxn.Payment(
    //     receiver=maker_account,
    //     amount=offer_amount,
    //     fee=0,
    // ).submit()
    itxn_submit
    // contract.py:454
    // self.escrowed_algo -= offer_amount
    intc_0 // 0
    bytec_1 // "escrowed_algo"
    app_global_get_ex
    assert // check self.escrowed_algo exists
    swap
    -
    bytec_1 // "escrowed_algo"
    swap
    app_global_put
    b cancel_offer_after_if_else@6


// fry_p2p_swap.contract.FryP2PSwap.reclaim_expired[routing]() -> void:
reclaim_expired:
    // contract.py:462
    // @arc4.abimethod()
    txna ApplicationArgs 1
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    // contract.py:468
    // offer_box = Box(Bytes, key=op.itob(offer_id))
    itob
    dupn 2
    // contract.py:469
    // assert offer_box, "Offer not found"
    box_len
    bury 1
    assert // Offer not found
    // contract.py:471
    // status = op.btoi(offer_box.extract(0, 8))
    dup
    intc_0 // 0
    intc_2 // 8
    box_extract
    btoi
    // contract.py:472
    // maker_bytes = offer_box.extract(8, 32)
    dig 1
    intc_2 // 8
    intc_3 // 32
    box_extract
    dup
    cover 3
    cover 3
    // contract.py:473
    // offer_amount = op.btoi(offer_box.extract(40, 8))
    dig 1
    pushint 40
    intc_2 // 8
    box_extract
    btoi
    cover 4
    // contract.py:474
    // expiry = op.btoi(offer_box.extract(88, 8))
    dig 1
    pushint 88
    intc_2 // 8
    box_extract
    btoi
    // contract.py:476
    // assert status == UInt64(0), "Offer not open"
    swap
    !
    assert // Offer not open
    // contract.py:477
    // assert expiry, "Offer has no expiry"
    dup
    assert // Offer has no expiry
    // contract.py:478
    // assert Global.latest_timestamp > expiry, "Offer not yet expired"
    global LatestTimestamp
    <
    assert // Offer not yet expired
    // contract.py:480-481
    // # EFFECTS: mark as cancelled BEFORE interactions
    // offer_box.replace(0, op.itob(UInt64(2)))  # status = cancelled
    pushint 2
    itob
    intc_0 // 0
    swap
    box_replace
    // contract.py:483-484
    // # Return escrowed assets to maker
    // offer_asset_id = self.offer_asset_id
    intc_0 // 0
    bytec_2 // "offer_asset_id"
    app_global_get_ex
    swap
    dup
    cover 2
    cover 5
    assert // check self.offer_asset_id exists
    // contract.py:485
    // maker_account = Account(maker_bytes)
    swap
    len
    intc_3 // 32
    ==
    assert // Address length is 32 bytes
    // contract.py:486
    // if offer_asset_id:
    bz reclaim_expired_else_body@4
    // contract.py:487-492
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(offer_asset_id),
    //     asset_receiver=maker_account,
    //     asset_amount=offer_amount,
    //     fee=0,
    // ).submit()
    itxn_begin
    itxn_field AssetReceiver
    itxn_field AssetAmount
    dup
    itxn_field XferAsset
    // contract.py:487
    // itxn.AssetTransfer(
    pushint 4 // axfer
    itxn_field TypeEnum
    // contract.py:491
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:487-492
    // itxn.AssetTransfer(
    //     xfer_asset=Asset(offer_asset_id),
    //     asset_receiver=maker_account,
    //     asset_amount=offer_amount,
    //     fee=0,
    // ).submit()
    itxn_submit

reclaim_expired_after_if_else@6:
    // contract.py:501-502
    // # Cleanup
    // del offer_box.value
    dig 1
    box_del
    pop
    // contract.py:503
    // self.active_offer_count -= UInt64(1)
    intc_0 // 0
    bytec_0 // "active_offer_count"
    app_global_get_ex
    assert // check self.active_offer_count exists
    intc_1 // 1
    -
    bytec_0 // "active_offer_count"
    swap
    app_global_put
    // contract.py:462
    // @arc4.abimethod()
    intc_1 // 1
    return

reclaim_expired_else_body@4:
    // contract.py:494-498
    // itxn.Payment(
    //     receiver=maker_account,
    //     amount=offer_amount,
    //     fee=0,
    // ).submit()
    itxn_begin
    swap
    dup
    itxn_field Amount
    swap
    itxn_field Receiver
    // contract.py:494
    // itxn.Payment(
    intc_1 // pay
    itxn_field TypeEnum
    // contract.py:497
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:494-498
    // itxn.Payment(
    //     receiver=maker_account,
    //     amount=offer_amount,
    //     fee=0,
    // ).submit()
    itxn_submit
    // contract.py:499
    // self.escrowed_algo -= offer_amount
    intc_0 // 0
    bytec_1 // "escrowed_algo"
    app_global_get_ex
    assert // check self.escrowed_algo exists
    swap
    -
    bytec_1 // "escrowed_algo"
    swap
    app_global_put
    b reclaim_expired_after_if_else@6


// fry_p2p_swap.contract.FryP2PSwap.update_fee[routing]() -> void:
update_fee:
    // contract.py:507
    // @arc4.abimethod()
    txna ApplicationArgs 1
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    // contract.py:509
    // assert Txn.sender == self.creator, "Admin only"
    txn Sender
    intc_0 // 0
    bytec 4 // "creator"
    app_global_get_ex
    assert // check self.creator exists
    ==
    assert // Admin only
    // contract.py:510
    // assert new_fee_bps <= UInt64(1000), "Fee cannot exceed 10%"
    dup
    pushint 1000
    <=
    assert // Fee cannot exceed 10%
    // contract.py:511
    // self.fee_bps = new_fee_bps
    bytec 8 // "fee_bps"
    swap
    app_global_put
    // contract.py:507
    // @arc4.abimethod()
    intc_1 // 1
    return


// fry_p2p_swap.contract.FryP2PSwap.update_fee_recipient[routing]() -> void:
update_fee_recipient:
    // contract.py:513
    // @arc4.abimethod()
    txna ApplicationArgs 1
    dup
    len
    intc_3 // 32
    ==
    assert // invalid number of bytes for arc4.static_array<arc4.uint8, 32>
    // contract.py:515
    // assert Txn.sender == self.creator, "Admin only"
    txn Sender
    intc_0 // 0
    bytec 4 // "creator"
    app_global_get_ex
    assert // check self.creator exists
    ==
    assert // Admin only
    // contract.py:516
    // self.fee_recipient = new_recipient
    bytec 5 // "fee_recipient"
    swap
    app_global_put
    // contract.py:513
    // @arc4.abimethod()
    intc_1 // 1
    return


// fry_p2p_swap.contract.FryP2PSwap.pause[routing]() -> void:
pause:
    // contract.py:520
    // assert Txn.sender == self.creator, "Admin only"
    txn Sender
    intc_0 // 0
    bytec 4 // "creator"
    app_global_get_ex
    assert // check self.creator exists
    ==
    assert // Admin only
    // contract.py:521
    // self.is_active = UInt64(0)
    bytec_3 // "is_active"
    intc_0 // 0
    app_global_put
    // contract.py:518
    // @arc4.abimethod()
    intc_1 // 1
    return


// fry_p2p_swap.contract.FryP2PSwap.resume[routing]() -> void:
resume:
    // contract.py:525
    // assert Txn.sender == self.creator, "Admin only"
    txn Sender
    intc_0 // 0
    bytec 4 // "creator"
    app_global_get_ex
    assert // check self.creator exists
    ==
    assert // Admin only
    // contract.py:526
    // self.is_active = UInt64(1)
    bytec_3 // "is_active"
    intc_1 // 1
    app_global_put
    // contract.py:523
    // @arc4.abimethod()
    intc_1 // 1
    return


// fry_p2p_swap.contract.FryP2PSwap.withdraw_excess_mbr[routing]() -> void:
withdraw_excess_mbr:
    // contract.py:528
    // @arc4.abimethod()
    txna ApplicationArgs 1
    dup
    len
    intc_2 // 8
    ==
    assert // invalid number of bytes for arc4.uint64
    btoi
    // contract.py:532
    // assert Txn.sender == self.creator, "Admin only"
    txn Sender
    intc_0 // 0
    bytec 4 // "creator"
    app_global_get_ex
    assert // check self.creator exists
    swap
    dig 1
    ==
    assert // Admin only
    // contract.py:533
    // assert amount, "Amount must be positive"
    dig 1
    assert // Amount must be positive
    // contract.py:535
    // available = Global.current_application_address.balance - Global.current_application_address.min_balance - self.escrowed_algo
    global CurrentApplicationAddress
    acct_params_get AcctBalance
    assert // account funded
    global CurrentApplicationAddress
    acct_params_get AcctMinBalance
    assert // account funded
    -
    intc_0 // 0
    bytec_1 // "escrowed_algo"
    app_global_get_ex
    assert // check self.escrowed_algo exists
    -
    // contract.py:536
    // assert amount <= available, "Would breach minimum balance or escrow"
    dig 2
    >=
    assert // Would breach minimum balance or escrow
    // contract.py:538-542
    // itxn.Payment(
    //     receiver=self.creator,
    //     amount=amount,
    //     fee=0,
    // ).submit()
    itxn_begin
    itxn_field Receiver
    itxn_field Amount
    // contract.py:538
    // itxn.Payment(
    intc_1 // pay
    itxn_field TypeEnum
    // contract.py:541
    // fee=0,
    intc_0 // 0
    itxn_field Fee
    // contract.py:538-542
    // itxn.Payment(
    //     receiver=self.creator,
    //     amount=amount,
    //     fee=0,
    // ).submit()
    itxn_submit
    // contract.py:528
    // @arc4.abimethod()
    intc_1 // 1
    return
`;

/** Clear program TEAL source (AVM v11) */
export const P2P_CLEAR_TEAL = `#pragma version 11
#pragma typetrack false

// algopy.arc4.ARC4Contract.clear_state_program() -> uint64:
main:
    pushint 1
    return
`;

/**
 * Get the correct TEAL source for a chain.
 * Voi requires AVM v10 (only difference is pragma version line).
 */
export function getP2PTeal(chainId: string) {
  const isVoi = chainId === 'voi-mainnet';
  return {
    approval: isVoi
      ? P2P_APPROVAL_TEAL.replace('#pragma version 11', '#pragma version 10')
      : P2P_APPROVAL_TEAL,
    clear: isVoi
      ? P2P_CLEAR_TEAL.replace('#pragma version 11', '#pragma version 10')
      : P2P_CLEAR_TEAL,
  };
}
