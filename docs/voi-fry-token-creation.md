# FRY Token Creation on Voi Network

## Prerequisites
- A Voi wallet funded with VOI for gas (~0.3 VOI minimum for ASA creation)
- Access to Voi algod endpoint (mainnet-api.voi.nodely.dev or local node)
- Node.js with algosdk

## Token Parameters (match Algorand FRY)
| Parameter | Value |
|-----------|-------|
| Name | Fry Token |
| Unit Name | FRY |
| Decimals | 6 |
| Total Supply | TBD (see Supply Strategy below) |
| Manager | Voi treasury wallet |
| Reserve | Voi treasury wallet |
| Freeze | null (no freeze) |
| Clawback | null (no clawback) |
| URL | https://fry.farm |

## Creation Script (Node.js)
```javascript
const algosdk = require('algosdk');

const VOI_ALGOD = 'https://mainnet-api.voi.nodely.dev';
const TREASURY_MNEMONIC = '...'; // Voi treasury wallet mnemonic

async function createFryOnVoi() {
  const algod = new algosdk.Algodv2('', VOI_ALGOD, 443);
  const account = algosdk.mnemonicToSecretKey(TREASURY_MNEMONIC);
  const params = await algod.getTransactionParams().do();

  const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
    from: account.addr,
    total: 1_000_000_000_000_000, // 1 billion FRY (with 6 decimals)
    decimals: 6,
    defaultFrozen: false,
    unitName: 'FRY',
    assetName: 'Fry Token',
    assetURL: 'https://fry.farm',
    manager: account.addr,
    reserve: account.addr,
    suggestedParams: params,
  });

  const signed = txn.signTxn(account.sk);
  const { txid } = await algod.sendRawTransaction(signed).do();
  const result = await algosdk.waitForConfirmation(algod, txid, 4);

  console.log('FRY ASA ID on Voi:', result['asset-index']);
  console.log('TX ID:', txid);
}

createFryOnVoi();
```

## Post-Creation Steps
1. Record the new ASA ID
2. Update `/opt/fry-farm/frontend/src/config/chains/voi-mainnet.ts`: set `fryTokenId`
3. Update `/opt/fry-farm/backend/config/chains.js`: set Voi `fryTokenId`
4. Create initial liquidity on Nomadex (VOI/FRY pool)
5. Enable staking features in Voi chain config

## Supply Strategy (Decision Needed)

**Option A: Matched Supply**
Same total as Algorand FRY. Represents same project on both chains.
Risk: total circulating supply doubles without bridge.

**Option B: Separate Supply**
Independent Voi FRY, earned through Voi staking/farming.
Pro: clean separation. Con: different token economics per chain.

**Option C: Bridgeable (Future)**
Fixed total across both chains with a burn-mint bridge.
Most complex but cleanest long-term solution.

## Voi Node Connectivity (Verified)
- Public: `https://mainnet-api.voi.nodely.dev` (HTTP 200 confirmed)
- Indexer: `https://mainnet-idx.voi.nodely.dev`
