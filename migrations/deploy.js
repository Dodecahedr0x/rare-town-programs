const fs = require("fs");
const anchor = require("@project-serum/anchor");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");

const idl = require("../target/idl/collection.json");

module.exports = async function (provider) {
  anchor.setProvider(provider);

  const program = new anchor.Program(idl, idl.metadata.address, provider);

  const collectionSize = new anchor.BN(2472);
  const collectionKey = anchor.web3.Keypair.generate();
  const [tokenAddress, tokenBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("token", "utf8"), collectionKey.publicKey.toBuffer()],
      program.programId
    );
  const [tokenAuthorityAddress, tokenAuthorityBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("authority", "utf8"), collectionKey.publicKey.toBuffer()],
      program.programId
    );

  console.log("Trying to deploy collection:", collectionKey.publicKey.toString())

  await program.rpc.create(
    { token: tokenBump, authority: tokenAuthorityBump },
    collectionSize,
    provider.wallet.payer.publicKey,
    {
      accounts: {
        collection: collectionKey.publicKey,
        mint: tokenAddress,
        mintAuthority: tokenAuthorityAddress,
        user: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      instructions: [await program.account.collection.createInstruction(collectionKey)],
      signers: [collectionKey],
    }
  );

  console.log("Deployed collection:", collectionKey.publicKey.toString())

  fs.writeFileSync("../deployment.json", JSON.stringify({
    programKey: idl.metadata.address.toString(),
    collectionKey: collectionKey.publicKey.toString(),
    tokenKey: tokenAddress.toString()
  }, null, 2))
};
