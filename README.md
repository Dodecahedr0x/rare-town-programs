# Rare.town Programs

This repository contains the program to create an SPL token collection and an associated "beauty token".

The creator of the collection can specify the list of SPL tokens that are part of the collection. This is intended to work with NFTs. Once the collection is finished, it can be made immutable to prevent further upgrades.

Owners of tokens that are part of the collection can then claim a beauty token daily. This token can be spent on another token of the collection. You can then use a webapp to visualize the collection tokens, ranked by the amount of beauty token they received.

## Usage

1. `anchor deploy` to deploy the contract.
2. `anchor migrate` to create the collection. Be careful to update to note the public key of the collection, as you will need it to interact with the contract.
3. `node scripts/setMints.js` to set the collection. You need to define a correct list of token in the file `scripts/mints.json`