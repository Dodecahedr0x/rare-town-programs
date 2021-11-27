import { expect } from "chai";
import { BN, setProvider, Provider, workspace } from "@project-serum/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assertRevert } from "./utils";

describe("collection", () => {
  // Configure the client to use the local cluster.
  const provider = Provider.local();
  setProvider(provider);

  const program = workspace.Collection;
  const authority = Keypair.generate();
  const owner = Keypair.generate();
  const collection = Keypair.generate();
  const collectionSize = new BN(10);

  const mintKeys: Token[] = Array(collectionSize.toNumber()).fill(undefined);
  const tokenAccounts: PublicKey[] = Array(collectionSize.toNumber()).fill(
    undefined
  );

  it("Mints NFTs", async () => {
    const airdrop = await provider.connection.requestAirdrop(
      owner.publicKey,
      10 ** 10
    );
    await provider.connection.confirmTransaction(airdrop);

    for (let i = 0; i < collectionSize.toNumber(); i++) {
      mintKeys[i] = await Token.createMint(
        provider.connection,
        owner,
        owner.publicKey,
        null,
        0,
        TOKEN_PROGRAM_ID
      );

      tokenAccounts[i] = await mintKeys[i].createAccount(owner.publicKey);

      await mintKeys[i].mintTo(tokenAccounts[i], owner, [], 1);

      const accountInfo = await mintKeys[i].getAccountInfo(tokenAccounts[i]);
      expect(accountInfo.amount.toNumber()).to.equal(1);
    }
  });

  it("Create a collection", async () => {
    const [tokenAddress, tokenBump] = await PublicKey.findProgramAddress(
      [Buffer.from("token", "utf8"), collection.publicKey.toBuffer()],
      program.programId
    );
    const [tokenAuthorityAddress, tokenAuthorityBump] =
      await PublicKey.findProgramAddress(
        [Buffer.from("authority", "utf8"), collection.publicKey.toBuffer()],
        program.programId
      );
    await program.rpc.create(
      { token: tokenBump, authority: tokenAuthorityBump },
      collectionSize,
      authority.publicKey,
      {
        accounts: {
          collection: collection.publicKey,
          mint: tokenAddress,
          mintAuthority: tokenAuthorityAddress,
          user: provider.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
        },
        instructions: [
          await program.account.collection.createInstruction(collection),
        ],
        signers: [collection],
      }
    );

    const {
      authority: authKey,
      upgradable,
      size,
      token,
      mints,
    } = await program.account.collection.fetch(collection.publicKey);

    expect(authKey.toString()).to.equal(authority.publicKey.toString());
    expect(upgradable).to.equal(true);
    expect(size.toString()).to.equal(collectionSize.toString());
    expect(token.toString()).to.equal(tokenAddress.toString());
    expect(String(mints.length)).to.equal("2472");
    expect(mints.filter((m: PublicKey) => m.toString() == "0"));
  });

  it("Set mint", async () => {
    for (let index = 0; index < collectionSize.toNumber(); index++) {
      await program.rpc.setMint(new BN(index), mintKeys[index].publicKey, {
        accounts: {
          collection: collection.publicKey,
          authority: authority.publicKey,
        },
        signers: [authority],
      });

      const { mints } = await program.account.collection.fetch(
        collection.publicKey
      );

      expect(mints[index].mint.toString()).to.equal(
        mintKeys[index].publicKey.toString()
      );
    }
  });

  it("Prevent upgrades", async () => {
    let index = 1;
    await program.rpc.preventUpgrades({
      accounts: {
        collection: collection.publicKey,
        authority: authority.publicKey,
      },
      signers: [authority],
    });

    const { upgradable } = await program.account.collection.fetch(
      collection.publicKey
    );

    expect(upgradable).to.equal(false);

    await assertRevert(
      program.rpc.setMint(new BN(index), mintKeys[index].publicKey, {
        accounts: {
          collection: collection.publicKey,
          authority: authority.publicKey,
        },
        signers: [authority],
      })
    );
  });

  it("Claim", async () => {
    let index = 1;

    const { tokenAuthority, token } = await program.account.collection.fetch(
      collection.publicKey
    );

    const beautyToken = new Token(
      provider.connection,
      token,
      TOKEN_PROGRAM_ID,
      owner
    );

    // Creating a token account before claiming
    const beautyTokenAccount =
      await beautyToken.getOrCreateAssociatedAccountInfo(owner.publicKey);

    await program.rpc.claim(new BN(index), {
      accounts: {
        collection: collection.publicKey,
        claimedToken: mintKeys[index].publicKey,
        claimedTokenAccount: tokenAccounts[index],
        owner: owner.publicKey,
        tokenAccount: beautyTokenAccount.address,
        mint: token,
        mintAuthority: tokenAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      },
      signers: [owner],
    });

    const { mints } = await program.account.collection.fetch(
      collection.publicKey
    );

    const account = await beautyToken.getAccountInfo(
      beautyTokenAccount.address
    );
    expect(
      Math.abs(mints[index].claimed.toNumber() - Math.floor(Date.now() / 1000))
    ).lte(1);
    expect(account.amount.toNumber()).to.equal(10 ** 9);

    // Second claim fails because too soon
    await assertRevert(
      program.rpc.claim(new BN(index), {
        accounts: {
          collection: collection.publicKey,
          claimedToken: mintKeys[index].publicKey,
          claimedTokenAccount: tokenAccounts[index],
          owner: owner.publicKey,
          tokenAccount: beautyTokenAccount,
          mint: token,
          mintAuthority: tokenAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        },
        signers: [owner],
      })
    );
  });

  it("Spend", async () => {
    let index = 2;

    const { tokenAuthority, token } =
      await program.account.collection.fetch(collection.publicKey);

    const beautyToken = new Token(
      provider.connection,
      token,
      TOKEN_PROGRAM_ID,
      owner
    );

    // Fetching the token account
    const beautyTokenAccount =
      await beautyToken.getOrCreateAssociatedAccountInfo(owner.publicKey);

    await program.rpc.spend(new BN(index), new BN(10 ** 9), {
      accounts: {
        collection: collection.publicKey,
        targetToken: mintKeys[index].publicKey,
        spender: owner.publicKey,
        tokenAccount: beautyTokenAccount.address,
        mint: token,
        mintAuthority: tokenAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [owner],
    });

    const { mints } = await program.account.collection.fetch(
      collection.publicKey
    );

    const account = await beautyToken.getOrCreateAssociatedAccountInfo(
      owner.publicKey
    );
    expect(account.amount.toNumber()).to.equal(0);
    expect(mints[index].received.toNumber()).to.equal(10 ** 9);
  });
});
