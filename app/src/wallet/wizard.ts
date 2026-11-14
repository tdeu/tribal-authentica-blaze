// WizardConnect session for the whole app (one per tab). Framework-agnostic: React subscribes via
// `subscribe()`. Every item of the WALLET.md checklist is applied here; numbers refer to it.
import { initiateDappRelay, type DappRelayResult, type RelayUpdatePayload, type ProtocolMessage } from '@wizardconnect/core';
import { DappConnectionManager } from '@wizardconnect/dapp';
import { decodeHdPublicKey, encodeCashAddress, hash160 } from '@bitauth/libauth';
import { ADDRESS_PREFIX, DAPP_NAME, NETWORK } from '../config';
import type { WireTransaction } from './wire';

export const RECEIVE = 0; // BIP44 child index, WizardConnect path name "receive"
export const CHANGE = 1;  // "change"
export const PATH_NAME: Record<number, string> = { [RECEIVE]: 'receive', [CHANGE]: 'change' };
export const SIGN_TIMEOUT_MS = 180_000; // (5)

export type InputPath = [number, string, number];

export type WalletState = {
  relay: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  relayError?: string;
  pairingUri?: string;       // wiz://… for "Copy connection link"
  qrUri?: string;            // what the QR code encodes
  dappKey?: string;          // shown so the user can compare with Selene's dialog
  walletName?: string;
  approved: boolean;         // (1) true only once the xpubs have arrived
  walletNetwork?: 'mainnet' | 'chipnet';
  networkMismatch: boolean;
  address?: string;          // receive/0, P2PKH
  tokenAddress?: string;     // receive/0, token-aware (z… on mainnet)
  pending: boolean;          // a sign request is in flight
};

export type SignOutcome =
  | { ok: true; signedHex: string }
  | { ok: false; side: 'ours' | 'wallet' | 'timeout' | 'cancelled' | 'connection'; message: string };

type Listener = (s: WalletState) => void;
const nowSec = () => Math.floor(Date.now() / 1000);

class WizardWallet {
  private mgr = new DappConnectionManager(DAPP_NAME);
  private relay?: DappRelayResult;
  private listeners = new Set<Listener>();
  private lastWalletReady = 0; // (6) stale-disconnect guard, seconds
  private relayStart = 0;
  private inFlight?: { wire: WireTransaction; promise: Promise<SignOutcome>; abort: AbortController };
  state: WalletState = { relay: 'idle', approved: false, networkMismatch: false, pending: false };

  constructor() {
    this.mgr.on('messagereceived', (m: ProtocolMessage) => {
      if (m.action === 'wallet_ready') this.lastWalletReady = Math.max(this.lastWalletReady, m.time);
    });
    this.mgr.on('walletready', () => this.onWalletReady());
    this.mgr.on('reconnecting', () => this.set({ relay: 'reconnecting' }));
    this.mgr.on('disconnect', (reason, message) => {
      // (6) The relay replays old messages after a reconnect: a disconnect older than the latest
      // wallet_ready (or than this relay session) is stale and must not end the session.
      const t = (message as unknown as { time?: number } | undefined)?.time;
      const cutoff = Math.max(this.lastWalletReady, this.relayStart);
      if (typeof t === 'number' && t < cutoff) return;
      this.set({ relay: 'disconnected', relayError: String(reason), approved: false });
    });
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  private set(patch: Partial<WalletState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private onRelay = ({ client, status }: RelayUpdatePayload) => {
    this.mgr.updateConnection(client, status);
    // (6) The relay flaps every 10–30 s: show it, keep the session
    const relay: WalletState['relay'] = {
      connected: 'connected', reconnecting: 'reconnecting', disconnected: 'reconnecting', session_deleted: 'disconnected',
    }[status.status] as WalletState['relay'];
    this.set({ relay, relayError: status.error ?? undefined, ...(status.status === 'session_deleted' ? { approved: false } : {}) });
  };

  /** New pairing: fresh QR + link. */
  connect() {
    this.relay?.cleanup();
    this.mgr.clearStoredSession();
    this.relayStart = nowSec();
    this.lastWalletReady = 0;
    this.relay = initiateDappRelay(this.onRelay);
    this.mgr.attachRelay(this.relay);
    this.set({
      relay: 'connecting', approved: false, address: undefined, tokenAddress: undefined, walletName: undefined,
      pairingUri: this.relay.uri, qrUri: this.relay.qrUri, dappKey: this.relay.credentials.publicKey,
    });
  }

  /** Resume a stored session after a page reload, if any. Returns false if there is none. */
  resume(): boolean {
    const s = this.mgr.loadStoredSession();
    if (!s?.walletPublicKey) return false;
    this.relayStart = nowSec();
    this.relay = initiateDappRelay(this.onRelay, {
      existingCredentials: { privateKey: s.privateKey, secret: s.secret, walletPublicKey: s.walletPublicKey },
    });
    this.mgr.attachRelay(this.relay);
    this.set({ relay: 'connecting' });
    if (this.mgr.hasPath(RECEIVE)) this.onWalletReady();
    return true;
  }

  async disconnect() {
    this.inFlight?.abort.abort();
    try { await this.mgr.sendDisconnect('user disconnected'); } catch { /* best effort */ }
    this.relay?.cleanup();
    this.relay = undefined;
    this.mgr.clearStoredSession();
    this.set({ relay: 'idle', approved: false, address: undefined, tokenAddress: undefined, walletName: undefined,
      pairingUri: undefined, qrUri: undefined, dappKey: undefined, walletNetwork: undefined, networkMismatch: false });
  }

  private onWalletReady() {
    const walletName = this.mgr.walletName ?? undefined;
    // (1) Selene sends wallet_ready with paths [] until the user approves the connection.
    if (!this.mgr.hasPath(RECEIVE)) { this.set({ walletName, approved: false }); return; }
    const recv = this.mgr.getSessionPaths().find((p) => p.name === 'receive');
    const d = recv ? decodeHdPublicKey(recv.xpub) : 'no receive path';
    const walletNetwork = typeof d === 'string' ? undefined : d.network === 'mainnet' ? 'mainnet' : 'chipnet';
    const addr = this.addressAt(RECEIVE, 0);
    this.set({
      walletName, approved: true, walletNetwork,
      networkMismatch: walletNetwork !== undefined && walletNetwork !== NETWORK,
      address: addr?.address, tokenAddress: addr?.tokenAddress,
    });
  }

  /** P2PKH + token address at path/index, derived from the wallet's xpub. */
  addressAt(path: number, index: number) {
    const pk = this.mgr.getPubkey(path, BigInt(index));
    if (!pk) return undefined;
    const pkh = hash160(pk) as Uint8Array;
    return {
      pk, pkh,
      address: encodeCashAddress({ prefix: ADDRESS_PREFIX, type: 'p2pkh', payload: pkh }).address,
      tokenAddress: encodeCashAddress({ prefix: ADDRESS_PREFIX, type: 'p2pkhWithTokens', payload: pkh }).address,
    };
  }

  /**
   * Ask the wallet to sign `wire`. (5) One request at a time: calling again while one is pending
   * returns the SAME promise for the SAME tx, and refuses a different tx. (7) The tx is never
   * rebuilt: the exact wire object is kept until the wallet answers, it times out, or it is cancelled.
   */
  sign(wire: WireTransaction, inputPaths: InputPath[]): Promise<SignOutcome> {
    if (this.inFlight) {
      if (this.inFlight.wire.transaction === wire.transaction) return this.inFlight.promise;
      return Promise.resolve({ ok: false, side: 'ours', message: 'Another signature request is still pending in the wallet.' });
    }
    if (!this.state.approved) {
      return Promise.resolve({ ok: false, side: 'ours', message: 'Approve the connection in Selene first.' });
    }
    if (this.state.networkMismatch) {
      return Promise.resolve({ ok: false, side: 'ours', message: `Wallet is on ${this.state.walletNetwork}, app is on ${NETWORK}.` });
    }
    const abort = new AbortController();
    let timedOut = false;
    let sentSeq: number | undefined;
    let walletError: string | undefined;
    const onSent = (m: ProtocolMessage) => { if (m.action === 'sign_transaction_request') sentSeq = (m as { sequence?: number }).sequence; };
    const onRecv = (m: ProtocolMessage) => {
      const r = m as ProtocolMessage & { sequence?: number; error?: string };
      if (r.action === 'sign_transaction_response' && r.sequence === sentSeq && r.error) walletError = r.error;
    };
    this.mgr.on('messagesent', onSent);
    this.mgr.on('messagereceived', onRecv);
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, SIGN_TIMEOUT_MS);

    const promise = (async (): Promise<SignOutcome> => {
      try {
        // WizardConnect's types expect the WC object; Selene requires the hex wire form (2)
        const res = await this.mgr.signTransaction({ transaction: wire as never, inputPaths }, { signal: abort.signal });
        if (res.error || !res.signedTransaction) {
          return { ok: false, side: 'wallet', message: res.error ?? 'Wallet returned no signed transaction.' };
        }
        return { ok: true, signedHex: res.signedTransaction };
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        // (8) Label the failure by side
        if (sentSeq === undefined) return { ok: false, side: 'ours', message: `Request not sent: ${msg}` };
        if (walletError !== undefined) return { ok: false, side: 'wallet', message: walletError };
        if (timedOut) return { ok: false, side: 'timeout', message: `No answer from the wallet in ${SIGN_TIMEOUT_MS / 1000} s.` };
        if (abort.signal.aborted) return { ok: false, side: 'cancelled', message: 'Request cancelled.' };
        return { ok: false, side: 'connection', message: `Connection lost before the wallet answered: ${msg}` };
      } finally {
        clearTimeout(timer);
        this.mgr.off('messagesent', onSent);
        this.mgr.off('messagereceived', onRecv);
        this.inFlight = undefined;
        this.set({ pending: false });
      }
    })();
    this.inFlight = { wire, promise, abort };
    this.set({ pending: true });
    return promise;
  }

  cancelPending() { this.inFlight?.abort.abort(); }
}

export const wallet = new WizardWallet();
