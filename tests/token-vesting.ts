import * as anchor from "@project-serum/anchor";
import { IDL as lockerManagerIDL } from "../target/types/token_vesting";

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

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await lockerManager.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});