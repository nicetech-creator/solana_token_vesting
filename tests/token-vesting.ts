import * as anchor from "@project-serum/anchor";
import { IDL as lockerManagerIDL } from "../target/types/token_vesting";

import {
  PublicKey,
  SystemProgram,
  Keypair,
  Commitment,
  Connection,
} from "@solana/web3.js";
import * as splToken from "@solana/spl-token";
import assert from "assert";
import {
  createBalanceSandbox,
  createMint,
  createMintAndVault,
  createTokenAccount,
  createTokenAccountInstrs,
  sleep,
} from "./utils";
import { SendTxRequest } from "@project-serum/anchor/dist/cjs/provider";
import { TypeDef } from "@project-serum/anchor/dist/cjs/program/namespace/types";


const LOCKER_MANAGER_PROGRAM_ID = new anchor.web3.PublicKey(
  "GHUcyYWLFtz3wPc4KXswCvpS2ihVx9i4BAcAJyMmHMDJ"
);

describe("Locker Manager and Pool Manager", () => {
  const provider = anchor.AnchorProvider.env()
  const baseAccount = anchor.web3.Keypair.generate();

  anchor.setProvider(provider);
  
  const lockerManager = new anchor.Program(
    lockerManagerIDL,
    LOCKER_MANAGER_PROGRAM_ID,
    provider
  );

  let lockerManagerInfoAddress = null as PublicKey;
  let _lockerManagerBump = null as number;

  const lockerManagerNonce = new anchor.BN(
    Math.floor(Math.random() * 100000000)
  );

  let mint = null;
  let god = null;

  it("Sets up initial test state", async () => {
    const [_mint, _god] = await createMintAndVault(
      provider as anchor.AnchorProvider,
      new anchor.BN(1000000)
    );
    mint = _mint;
    god = _god;
  });

  it("Is initialized!", async () => {
    // Add your test here.

    [lockerManagerInfoAddress, _lockerManagerBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode("locker-manager")),
          lockerManagerNonce.toBuffer("le", 8),
        ],
        lockerManager.programId
      );
    
    const tx = await lockerManager.methods
      .initialize(lockerManagerNonce)
      .accounts({
        authority: provider.wallet.publicKey,
        lockerManagerInfo: lockerManagerInfoAddress,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Your transaction signature", tx);
  });

  it("Sets a new authority", async () => {
    const newAuthority = Keypair.generate();
    await lockerManager.methods
      .setAuthority(lockerManagerNonce, newAuthority.publicKey)
      .accounts({
        authority: provider.wallet.publicKey,
        lockerManagerInfo: lockerManagerInfoAddress,
      })
      .rpc();

    let lockerManagerInfo = await lockerManager.account.lockerManagerInfo.fetch(
      lockerManagerInfoAddress
    );
    assert.ok(lockerManagerInfo.authority.equals(newAuthority.publicKey));

    await lockerManager.methods
      .setAuthority(lockerManagerNonce, provider.wallet.publicKey)
      .accounts({
        authority: newAuthority.publicKey,
        lockerManagerInfo: lockerManagerInfoAddress,
      })
      .signers([newAuthority])
      .rpc();

    lockerManagerInfo = await lockerManager.account.lockerManagerInfo.fetch(
      lockerManagerInfoAddress
    );
    assert.ok(lockerManagerInfo.authority.equals(provider.wallet.publicKey));
  });

  const locker = Keypair.generate();
  let lockerAccount = null;
  let lockerVaultAuthority = null as PublicKey;

  it("Creates a locker account", async () => {
    const slot = await provider.connection.getSlot();
    const blocktime = await provider.connection.getBlockTime(slot);
    const startTs = new anchor.BN(blocktime);
    const endTs = new anchor.BN(startTs.toNumber() + 5);
    const periodCount = new anchor.BN(2);
    const beneficiary = provider.wallet.publicKey;
    const depositAmount = new anchor.BN(100);

    const vault = Keypair.generate();
    let [_lockerVaultAuthority, lockerVaultNonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [locker.publicKey.toBuffer()],
        lockerManager.programId
      );
    lockerVaultAuthority = _lockerVaultAuthority;

    const sig = await lockerManager.methods
      .createLocker(
        beneficiary,
        depositAmount,
        lockerVaultNonce,
        startTs,
        endTs,
        periodCount,
        null // Lock reward keeper is None.
      )
      .accounts({
        locker: locker.publicKey,
        vault: vault.publicKey,
        depositor: god,
        depositorAuthority: provider.wallet.publicKey,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([locker, vault])
      .preInstructions([
        await lockerManager.account.locker.createInstruction(locker),
        ...(await createTokenAccountInstrs(
          provider,
          vault.publicKey,
          mint,
          lockerVaultAuthority
        )),
      ])
      .rpc();

    lockerAccount = await lockerManager.account.locker.fetch(locker.publicKey);

    assert.ok(lockerAccount.beneficiary.equals(provider.wallet.publicKey));
    assert.ok(lockerAccount.mint.equals(mint));
    assert.ok(lockerAccount.grantor.equals(provider.wallet.publicKey));
    assert.ok(lockerAccount.currentBalance.eq(depositAmount));
    assert.ok(lockerAccount.startBalance.eq(depositAmount));
    assert.ok(lockerAccount.whitelistOwned.eq(new anchor.BN(0)));
    assert.equal(lockerAccount.nonce, lockerVaultNonce);
    assert.ok(lockerAccount.createdTs.gt(new anchor.BN(0)));
    assert.ok(lockerAccount.startTs.eq(startTs));
    assert.ok(lockerAccount.endTs.eq(endTs));
    assert.ok(lockerAccount.rewardKeeper === null);

    const vaultAccount = await splToken.getAccount(
      provider.connection,
      lockerAccount.vault
    );
  });

  it("Waits for a locker period to pass", async () => {
    await sleep(10 * 1000);

    const vaultAccount = await splToken.getAccount(
      provider.connection,
      lockerAccount.vault
    );
  });

  it("Withdraws from the locker account", async () => {
    const token = await createTokenAccount(
      provider,
      mint,
      provider.wallet.publicKey
    );

    await lockerManager.methods
      .withdraw(new anchor.BN(100))
      .accounts({
        locker: locker.publicKey,
        beneficiary: provider.wallet.publicKey,
        token,
        vault: lockerAccount.vault,
        lockerVaultAuthority,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .rpc();

    lockerAccount = await lockerManager.account.locker.fetch(locker.publicKey);
    assert.ok(lockerAccount.currentBalance.eq(new anchor.BN(0)));

    const vaultAccount = await splToken.getAccount(
      provider.connection,
      lockerAccount.vault
    );
    assert.ok(
      new anchor.BN(vaultAccount.amount.toString()).eq(new anchor.BN(0))
    );

    const tokenAccount = await splToken.getAccount(provider.connection, token);
    assert.ok(
      new anchor.BN(tokenAccount.amount.toString()).eq(new anchor.BN(100))
    );
  });
});