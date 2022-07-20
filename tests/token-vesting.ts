import * as anchor from "@project-serum/anchor";
import { IDL as lockerManagerIDL } from "../target/types/token_vesting";

import {
  PublicKey,
  SystemProgram,
  Keypair,
  Commitment,
  Connection,
} from "@solana/web3.js";

const LOCKER_MANAGER_PROGRAM_ID = new anchor.web3.PublicKey(
  "GHUcyYWLFtz3wPc4KXswCvpS2ihVx9i4BAcAJyMmHMDJ"
);

describe("Locker Manager and Pool Manager", () => {
  const provider = anchor.AnchorProvider.env()

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
      .initialize(new anchor.BN(0))
      .accounts({
        authority: provider.wallet.publicKey,
        lockerManagerInfo: lockerManagerInfoAddress,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Your transaction signature", tx);
  });
});