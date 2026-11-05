/**
 * Single source of truth for Whitechain networks and the assets this facilitator
 * will sponsor gas for. Everything else — viem clients, guards, docs components,
 * the demo endpoint, the DB table names — reads from here.
 *
 * Only EIP-3009 assets belong in `assets`. The facilitator settles exclusively via
 * `transferWithAuthorization`, so a token without it simply cannot be paid gaslessly.
 * See `scripts/verify-assets.ts`, which proves every entry below against the chain.
 */

export type NetworkKey = "testnet" | "mainnet";

export type AssetDef = {
  symbol: string;
  /** Human label for the UI and docs. */
  label: string;
  address: `0x${string}`;
  decimals: number;
  /**
   * EIP-712 domain the token actually signs with — what merchants must put in
   * `accepts.extra`. Not guessable from `name()`: bridged Circle tokens often
   * display one name and sign with another. Asserted against the on-chain
   * `DOMAIN_SEPARATOR()` by `verify-assets.ts` and at boot.
   */
  domain: { name: string; version: string };
  /** Expected on-chain DOMAIN_SEPARATOR(), as a tripwire against silent upgrades. */
  domainSeparator: `0x${string}`;
};

export type NetworkDef = {
  key: NetworkKey;
  /** CAIP-2 identifier used on the wire by x402. */
  caip2: `eip155:${number}`;
  chainId: number;
  name: string;
  rpc: string;
  wsRpc: string;
  explorer: string;
  bridge: string;
  faucet: string | null;
  /** Neon table for this network's payment log. A literal — never request input. */
  table: "payments_testnet" | "payments_mainnet";
  assets: AssetDef[];
};

/** Canonical EIP-3009 TransferWithAuthorization typehash. Every asset must match. */
export const TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
  "0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267" as const;

export const NETWORKS: Record<NetworkKey, NetworkDef> = {
  testnet: {
    key: "testnet",
    caip2: "eip155:1874",
    chainId: 1874,
    name: "Whitechain Sepolia",
    rpc: process.env.RPC_URL_TESTNET ?? "https://rpc.testnet.whitechain.io",
    wsRpc: "wss://rpc.testnet.whitechain.io/ws",
    explorer: "https://explorer.testnet.whitechain.io",
    bridge: "https://bridge.testnet.whitechain.io",
    faucet: "https://faucet.testnet.whitechain.io",
    table: "payments_testnet",
    assets: [
      {
        symbol: "USDC.e",
        label: "Bridged USDC (Whitechain)",
        address: "0x5Eb541ba8A2DD841aF7864c3389162a23ddA8401",
        decimals: 6,
        domain: { name: "Bridged USDC (Whitechain)", version: "2" },
        domainSeparator: "0x02c4779645b8009345e4ea4f18fd564ecab398b3581e107aca67a4be3f87f009",
      },
      {
        symbol: "USDT",
        label: "Tether USD",
        address: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
        decimals: 6,
        // TetherTokenV2 inherits OpenZeppelin's draft-ERC20PermitUpgradeable,
        // which pins the EIP-712 version to "1".
        domain: { name: "Tether USD", version: "1" },
        domainSeparator: "0xcdcfacb6b15c8238b4e5fbb47bdb83b7f83f50a531d264bf9763d2bd1d3d2a25",
      },
    ],
  },
  mainnet: {
    key: "mainnet",
    caip2: "eip155:1875",
    chainId: 1875,
    name: "Whitechain",
    rpc: process.env.RPC_URL_MAINNET ?? "https://rpc.whitechain.io",
    wsRpc: "wss://rpc.whitechain.io/ws",
    explorer: "https://explorer.whitechain.io",
    bridge: "https://bridge.whitechain.io",
    faucet: null,
    table: "payments_mainnet",
    assets: [
      {
        symbol: "USDC.e",
        label: "Bridged USDC (Whitechain)",
        address: "0xF97B9Bf62916f1EB42Dd906a7254603e7b9FC4a7",
        decimals: 6,
        domain: { name: "Bridged USDC (Whitechain)", version: "2" },
        domainSeparator: "0xfca7013f84dc83e932f37000898b9056161291e6a3247557ddc0974ac7dfa70b",
      },
      // Mainnet USDT (0xF95604a4034d8407d3F1256De56C9ae37F299cb8) is deliberately
      // absent: it is TetherToken V1, which has `permit` but no
      // `transferWithAuthorization`, so a gasless x402 `exact` payment is
      // impossible. Its total supply is also 0. See docs/supported-assets.
    ],
  },
};

export const NETWORK_KEYS = Object.keys(NETWORKS) as NetworkKey[];

/** Narrows an untrusted string to a NetworkKey. */
export function isNetworkKey(value: unknown): value is NetworkKey {
  return typeof value === "string" && value in NETWORKS;
}

/** Resolves a CAIP-2 identifier from the wire to a network, or undefined. */
export function networkByCaip2(caip2: string): NetworkDef | undefined {
  return NETWORK_KEYS.map((k) => NETWORKS[k]).find((n) => n.caip2 === caip2);
}

/**
 * Looks up an allowlisted asset by address within a single network.
 * Address comparison is case-insensitive; an asset from another network
 * does not match, which is what blocks cross-network replay attempts.
 */
export function findAsset(net: NetworkKey, address: string): AssetDef | undefined {
  const wanted = address.toLowerCase();
  return NETWORKS[net].assets.find((a) => a.address.toLowerCase() === wanted);
}

export function explorerTxUrl(net: NetworkKey, txHash: string): string {
  return `${NETWORKS[net].explorer}/tx/${txHash}`;
}

export function explorerAddressUrl(net: NetworkKey, address: string): string {
  return `${NETWORKS[net].explorer}/address/${address}`;
}
