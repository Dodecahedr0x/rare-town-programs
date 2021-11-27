const fs = require("fs");
const anchor = require("@project-serum/anchor");
const key = require("../key.json");
const deployment = require("../deployment.json");
const idl = require("../target/idl/collection.json");
const mints = require("./mints.json");

const setMints = async () => {
  const endpoint = process.argv[2];
  console.log("Using RPC:", endpoint)
  const connection = new anchor.web3.Connection(endpoint);
  const wallet = new anchor.Wallet(
    anchor.web3.Keypair.fromSecretKey(Uint8Array.from(key))
  );
  const provider = new anchor.Provider(connection, wallet, {
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  console.log("Using wallet", wallet.publicKey.toString());

  const program = new anchor.Program(idl, idl.metadata.address, provider);

  const collection = new anchor.web3.PublicKey(deployment.collectionKey);

  let checkpoint = 0
  try {
    checkpoint = JSON.parse(fs.readFileSync("scripts/checkpoint.json").toString()).iteration
  } catch(err) {
    console.log("Could not find a checkpoint, starting from 0")
  }
  
  console.log("Starting at token #", checkpoint)

  for (let i = checkpoint; i < mints.length; i++) {
    try {
      const tx = await program.rpc.setMint(
        new anchor.BN(i),
        new anchor.web3.PublicKey(mints[i]),
        {
          accounts: {
            collection: collection,
            authority: wallet.publicKey,
          },
        }
      );
      fs.writeFileSync("scripts/checkpoint.json", JSON.stringify({ iteration: i }))
      console.log("Setting mint", i, "with pubkey", mints[i]);
    } catch (err) {
      console.log("Retrying in 5 sec...", err)
      await new Promise((resolve) => setTimeout(resolve, 5000));
      i -= 1;
    }
  }
};

setMints();
