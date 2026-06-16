import {
  ABIMethod,
  Transaction,
  TransactionSigner,
} from 'algosdk';

/** Pool ABI methods needed for swap, LP, and ARC-200 operations (algosdk v2) */
export const POOL_ABI_METHODS: ABIMethod[] = [
  new ABIMethod({
    name: 'swapAlphaToBeta',
    args: [
      { name: 'alphaTxn', type: 'txn' },
      { name: 'minBetaAmount', type: 'uint256' },
    ],
    returns: { type: 'uint256' },
  }),
  new ABIMethod({
    name: 'swapBetaToAlpha',
    args: [
      { name: 'betaTxn', type: 'txn' },
      { name: 'minAlphaAmount', type: 'uint256' },
    ],
    returns: { type: 'uint256' },
  }),
  new ABIMethod({
    name: 'addLiquidity',
    args: [
      { name: 'alphaTxn', type: 'txn' },
      { name: 'betaTxn', type: 'txn' },
    ],
    returns: { type: 'bool' },
  }),
  new ABIMethod({
    name: 'removeLiquidity',
    args: [{ name: 'lptAmount', type: 'uint256' }],
    returns: { type: 'bool' },
  }),
  new ABIMethod({
    name: 'arc200_balanceOf',
    args: [{ name: 'owner', type: 'address' }],
    returns: { type: 'uint256' },
  }),
  new ABIMethod({
    name: 'arc200_transfer',
    args: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    returns: { type: 'bool' },
  }),
  new ABIMethod({
    name: 'createBalanceBox',
    args: [{ name: 'owner', type: 'address' }],
    returns: { type: 'bool' },
  }),
  new ABIMethod({
    name: 'hasBox',
    args: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    returns: { type: 'bool' },
  }),
];

export function getABIMethod(name: string): ABIMethod {
  const m = POOL_ABI_METHODS.find((m) => m.name === name);
  if (!m) throw new Error(`ABI method "${name}" not found`);
  return m;
}

/** No-op signer for building unsigned transactions via ATC */
export const noopSigner: TransactionSigner = async (
  _txnGroup: Transaction[],
  _indexesToSign: number[]
): Promise<Uint8Array[]> => {
  return _indexesToSign.map(() => new Uint8Array());
};
