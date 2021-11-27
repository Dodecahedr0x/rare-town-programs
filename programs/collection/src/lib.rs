use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, InitializeMint, Mint, MintTo, Token, TokenAccount};

declare_id!("HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65L");

#[program]
mod collection {
    use super::*;

    /// Creates a new collection and its beauty token
    pub fn create(
        ctx: Context<Create>,
        bumps: Bumps,
        collection_size: u64,
        authority: Pubkey,
    ) -> ProgramResult {
        msg!("Creating a collection");

        let mut collection = ctx.accounts.collection.load_init()?;

        collection.upgradable = true;
        collection.size = collection_size;
        collection.authority = authority;
        collection.token = ctx.accounts.mint.key();
        collection.token_authority = ctx.accounts.mint_authority.key();
        collection.bumps = bumps;

        token::initialize_mint(
            ctx.accounts.initialize_mint_context(),
            9,
            &ctx.accounts.mint_authority.key(),
            Some(&ctx.accounts.mint_authority.key()),
        )?;

        Ok(())
    }

    pub fn set_mint(ctx: Context<SetMint>, index: u64, mint: Pubkey) -> ProgramResult {
        msg!("Setting a mint");

        let mut collection = ctx.accounts.collection.load_mut()?;
        collection.mints[index as usize].mint = mint;

        Ok(())
    }

    pub fn prevent_upgrades(ctx: Context<PreventUpgrade>) -> ProgramResult {
        ctx.accounts.collection.load_mut()?.upgradable = false;
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>, index: u64) -> ProgramResult {
        msg!("Claiming collection tokens");

        let mut collection = ctx.accounts.collection.load_mut()?;

        let current_time = Clock::get().unwrap().unix_timestamp;
        if current_time - collection.mints[index as usize].claimed < 86400 {
            return Err(ErrorCode::ClaimingEarly.into());
        }

        collection.mints[index as usize].claimed = current_time;

        let collection_key = ctx.accounts.collection.to_account_info().key();
        let seeds = &[
            b"authority".as_ref(),
            collection_key.as_ref(),
            &[collection.bumps.authority],
        ];
        let signer = &[&seeds[..]];

        let context = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer,
        );

        token::mint_to(context, 10_u64.pow(9))?;
        Ok(())
    }

    pub fn spend(ctx: Context<Spend>,  index: u64, amount: u64) -> ProgramResult {
        msg!("Spending collection tokens");

        let collection_key = ctx.accounts.collection.to_account_info().key();
        let mut collection = ctx.accounts.collection.load_mut()?;

        collection.mints[index as usize].received += amount;

        let seeds = &[
            b"authority".as_ref(),
            collection_key.as_ref(),
            &[collection.bumps.authority],
        ];
        let signer = &[&seeds[..]];

        let context = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.token_account.to_account_info(),
                authority: ctx.accounts.spender.to_account_info(),
            },
            signer,
        );

        token::burn(context, amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(bumps: Bumps)]
pub struct Create<'info> {
    /// The account used to store data about a collection
    #[account(zero)]
    pub collection: Loader<'info, Collection>,

    /// The mint for beauty tokens
    #[account(init,
        seeds = [
            b"token",
            collection.key().as_ref()
        ],
        bump = bumps.token,
        payer = user,
        owner = token::ID,
        space = Mint::LEN)]
    pub mint: AccountInfo<'info>,

    /// The mint for beauty tokens
    #[account(seeds = [
            b"authority",
            collection.key().as_ref()
        ],
        bump = bumps.authority)]
    pub mint_authority: AccountInfo<'info>,

    /// The fee payer
    #[account(mut)]
    pub user: Signer<'info>,

    /// The program for interacting with the token.
    #[account(address = token::ID)]
    pub token_program: Program<'info, Token>,

    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

impl<'info> Create<'info> {
    fn initialize_mint_context(&self) -> CpiContext<'_, '_, '_, 'info, InitializeMint<'info>> {
        CpiContext::new(
            elf.token_program.to_account_info(),
            InitializeMint {
                mint: self.mint.clone(),
                rent: self.rent.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
#[instruction(index: u64)]
pub struct SetMint<'info> {
    /// The account used to store data about a collection
    #[account(mut, has_one = authority, constraint = collection.load()?.size > index && collection.load()?.upgradable)]
    pub collection: Loader<'info, Collection>,

    /// The collection authority
    #[account(signer)]
    pub authority: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct PreventUpgrade<'info> {
    /// The account used to store data about a collection
    #[account(mut, has_one = authority, constraint = collection.load()?.upgradable)]
    pub collection: Loader<'info, Collection>,

    /// The collection authority
    #[account(signer)]
    pub authority: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(index: u64)]
pub struct Claim<'info> {
    /// The account used to store data about a collection
    #[account(mut)]
    pub collection: Loader<'info, Collection>,

    /// The token for which the user claims
    #[account(constraint = collection.load()?.mints[index as usize].mint == claimed_token.key()))]
    pub claimed_token: AccountInfo<'info>,

    /// The account holding the claimed token
    #[account(constraint = claimed_token_account.owner == owner.key() && claimed_token_account.mint == claimed_token.key()]
    pub claimed_token_account: Account<'info, TokenAccount>,

    /// The owner of the token
    #[account(signer)]
    pub owner: AccountInfo<'info>,

    /// The token account of the owner
    #[account(mut, constraint = token_account.owner == owner.key() && token_account.mint == collection.load()?.token)]
    pub token_account: Account<'info, TokenAccount>,

    /// The mint of the collection token
    #[account(mut, constraint = mint.mint_authority.unwrap() == mint_authority.key())]
    pub mint: Account<'info, Mint>,

    /// The mint authority of the collection token (PDA)
    #[account(address = collection.load()?.token_authority)]
    pub mint_authority: AccountInfo<'info>,

    /// The program for interacting with the token.
    #[account(address = token::ID)]
    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(index: u64)]
pub struct Spend<'info> {
    /// The account used to store data about a collection
    #[account(mut)]
    pub collection: Loader<'info, Collection>,

    /// The token receiving
    #[account(constraint = target_token.key() == collection.load()?.mints[index as usize].mint)]
    pub target_token: AccountInfo<'info>,

    /// The spender
    #[account(signer)]
    pub spender: AccountInfo<'info>,

    /// The token account of the spender
    #[account(mut, constraint = token_account.owner == spender.key() && token_account.mint == collection.load()?.token)]
    pub token_account: Account<'info, TokenAccount>,

    /// The mint of the collection token
    #[account(mut, constraint = mint.mint_authority.unwrap() == mint_authority.key())]
    pub mint: Account<'info, Mint>,

    /// The mint authority of the collection token (PDA)
    #[account(address = collection.load()?.token_authority)]
    pub mint_authority: AccountInfo<'info>,

    /// The program for interacting with the token.
    #[account(address = token::ID)]
    pub token_program: Program<'info, Token>,
}

#[account(zero_copy)]
pub struct Collection {
    pub authority: Pubkey,
    pub upgradable: bool,
    pub size: u64,
    pub token: Pubkey,
    pub token_authority: Pubkey,
    pub bumps: Bumps,
    pub mints: [CollectionMint; 2472],
}

#[zero_copy]
pub struct CollectionMint {
    mint: Pubkey,
    received: u64,
    claimed: i64,
}

#[zero_copy]
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct Bumps {
    pub token: u8,
    pub authority: u8,
}

#[error]
pub enum ErrorCode {
    #[msg("Last claim is less than 24h old")]
    ClaimingEarly,
}
