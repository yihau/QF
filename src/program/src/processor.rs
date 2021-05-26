use crate::{
    error::QFError,
    instruction::QFInstruction,
    state::{Project, Round, RoundStatus, Voter},
};
use num_traits::FromPrimitive;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    decode_error::DecodeError,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::{PrintProgramError, ProgramError},
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    system_instruction, system_program,
    sysvar::{rent::Rent, Sysvar},
};
use spl_math::{
    precise_number::{PreciseNumber, ONE},
    uint::U256,
};

use spl_associated_token_account;
use spl_token;

pub struct Processor {}
impl Processor {
    pub fn process_start_round(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let new_round_info = next_account_info(account_info_iter)?;
        let round_owner_info = next_account_info(account_info_iter)?;
        let associated_program_info = next_account_info(account_info_iter)?;
        let funder_info = next_account_info(account_info_iter)?;
        let associated_token_account_info = next_account_info(account_info_iter)?;
        let wallet_account_info = next_account_info(account_info_iter)?;
        let spl_token_mint_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let spl_token_program_info = next_account_info(account_info_iter)?;
        let rent_sysvar_info = next_account_info(account_info_iter)?;
        let rent = &Rent::from_account_info(rent_sysvar_info)?;

        if new_round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        if new_round_info.data_len() != Round::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        if !rent.is_exempt(new_round_info.lamports(), Round::LEN) {
            return Err(ProgramError::AccountNotRentExempt);
        }
        let mut round = Round::unpack_unchecked(&new_round_info.data.borrow())?;
        if round.is_initialized() {
            return Err(ProgramError::AccountAlreadyInitialized);
        }

        if associated_program_info.key != &spl_associated_token_account::ID {
            return Err(QFError::UnexpectedTokenProgramID.into());
        }

        let (expected_wallet, _) =
            Pubkey::find_program_address(&[&new_round_info.key.to_bytes()], &program_id);
        if wallet_account_info.key != &expected_wallet {
            return Err(QFError::OwnerMismatch.into());
        }

        if system_program_info.key != &system_program::ID {
            return Err(QFError::UnexpectedSystemProgramID.into());
        }

        if spl_token_program_info.key != &spl_token::ID {
            return Err(QFError::UnexpectedTokenProgramID.into());
        }

        invoke(
            &spl_associated_token_account::create_associated_token_account(
                funder_info.key,
                wallet_account_info.key,
                spl_token_mint_info.key,
            ),
            &[
                associated_program_info.clone(),
                funder_info.clone(),
                associated_token_account_info.clone(),
                wallet_account_info.clone(),
                spl_token_mint_info.clone(),
                system_program_info.clone(),
                spl_token_program_info.clone(),
                rent_sysvar_info.clone(),
            ],
        )?;

        round.status = RoundStatus::Ongoing;
        round.fund = 0;
        round.owner = *round_owner_info.key;
        round.vault = *associated_token_account_info.key;
        round.area = U256::zero();

        Round::pack(round, &mut new_round_info.data.borrow_mut())?;
        Ok(())
    }

    pub fn process_donate(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
        decimals: u8,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let round_info = next_account_info(account_info_iter)?;
        let from_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let to_info = next_account_info(account_info_iter)?;
        let from_auth_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;

        if round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut round = Round::unpack(&round_info.data.borrow())?;
        if round.status != RoundStatus::Ongoing {
            return Err(QFError::RoundStatusError.into());
        }

        if to_info.key != &round.vault {
            return Err(QFError::VaultMismatch.into());
        }

        if token_program_info.key != &spl_token::ID {
            return Err(QFError::UnexpectedTokenProgramID.into());
        }

        invoke(
            &spl_token::instruction::transfer_checked(
                &token_program_info.key,
                &from_info.key,
                &mint_info.key,
                &to_info.key,
                &from_auth_info.key,
                &[&from_auth_info.key],
                amount,
                decimals,
            )?,
            &[
                from_info.clone(),
                mint_info.clone(),
                to_info.clone(),
                from_auth_info.clone(),
                token_program_info.clone(),
            ],
        )?;

        round.fund = round.fund.checked_add(amount).unwrap();
        Round::pack(round, &mut round_info.data.borrow_mut())?;

        Ok(())
    }

    pub fn process_register_project(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let new_project_info = next_account_info(account_info_iter)?;
        let round_info = next_account_info(account_info_iter)?;
        let project_owner_info = next_account_info(account_info_iter)?;
        let rent = &Rent::from_account_info(next_account_info(account_info_iter)?)?;

        if round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let round = Round::unpack(&round_info.data.borrow())?;
        if round.status != RoundStatus::Ongoing {
            return Err(QFError::RoundStatusError.into());
        }

        if new_project_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut project = Project::unpack_unchecked(&new_project_info.data.borrow())?;
        if project.is_initialized() {
            return Err(ProgramError::AccountAlreadyInitialized);
        }

        if new_project_info.data_len() != Project::LEN {
            return Err(ProgramError::InvalidAccountData);
        }

        if !rent.is_exempt(new_project_info.lamports(), Project::LEN) {
            return Err(ProgramError::AccountNotRentExempt);
        }

        project.round = *round_info.key;
        project.owner = *project_owner_info.key;
        project.withdraw = false;
        project.votes = 0;
        project.area = U256::zero();

        Project::pack(project, &mut new_project_info.data.borrow_mut())?;

        Ok(())
    }

    pub fn process_init_voter(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let new_voter_info = next_account_info(account_info_iter)?;
        let voter_token_holder_info = next_account_info(account_info_iter)?;
        let project_info = next_account_info(account_info_iter)?;
        let from_info = next_account_info(account_info_iter)?;
        let system_program_info = next_account_info(account_info_iter)?;
        let rent = &Rent::from_account_info(next_account_info(account_info_iter)?)?;

        if project_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        Project::unpack(&project_info.data.borrow())?;

        let (_, bump_seed) = Pubkey::find_program_address(
            &[
                &project_info.key.to_bytes(),
                &voter_token_holder_info.key.to_bytes(),
            ],
            &program_id,
        );
        let seeds: &[&[_]] = &[
            &project_info.key.to_bytes(),
            &voter_token_holder_info.key.to_bytes(),
            &[bump_seed],
        ];

        let required_lamports = rent
            .minimum_balance(Voter::LEN)
            .max(1)
            .saturating_sub(new_voter_info.lamports());

        if required_lamports > 0 {
            msg!("Transfer {} lamports to the voter", required_lamports);
            invoke(
                &system_instruction::transfer(
                    &from_info.key,
                    &new_voter_info.key,
                    required_lamports,
                ),
                &[
                    from_info.clone(),
                    new_voter_info.clone(),
                    system_program_info.clone(),
                ],
            )?;
        }

        msg!("Allocate space for the voter");
        invoke_signed(
            &system_instruction::allocate(new_voter_info.key, Voter::LEN as u64),
            &[new_voter_info.clone(), system_program_info.clone()],
            &[&seeds],
        )?;

        msg!("Assign voter to QF Program");
        invoke_signed(
            &system_instruction::assign(new_voter_info.key, &program_id),
            &[new_voter_info.clone(), system_program_info.clone()],
            &[&seeds],
        )?;

        let mut voter = Voter::unpack_unchecked(&new_voter_info.data.borrow())?;
        if voter.is_initialized() {
            return Err(ProgramError::AccountAlreadyInitialized);
        }

        voter.is_initialized = true;
        voter.votes = 0;
        voter.votes_sqrt = U256::from(0);

        Voter::pack(voter, &mut new_voter_info.data.borrow_mut())?;

        Ok(())
    }

    pub fn process_vote(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
        decimals: u8,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let round_info = next_account_info(account_info_iter)?;
        let project_info = next_account_info(account_info_iter)?;
        let voter_info = next_account_info(account_info_iter)?;
        let from_info = next_account_info(account_info_iter)?;
        let mint_info = next_account_info(account_info_iter)?;
        let to_info = next_account_info(account_info_iter)?;
        let from_auth_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;

        if round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut round = Round::unpack(&round_info.data.borrow())?;
        if round.status != RoundStatus::Ongoing {
            return Err(QFError::RoundStatusError.into());
        }
        if to_info.key != &round.vault {
            return Err(QFError::VaultMismatch.into());
        }

        if project_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut project = Project::unpack(&project_info.data.borrow())?;
        if project.round != *round_info.key {
            return Err(QFError::RoundMismatch.into());
        }

        if voter_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let (expected_key, _) = Pubkey::find_program_address(
            &[&project_info.key.to_bytes(), &from_info.key.to_bytes()],
            &program_id,
        );
        if voter_info.key != &expected_key {
            return Err(QFError::VoterMismatch.into());
        }
        let mut voter = Voter::unpack(&voter_info.data.borrow())?;

        if token_program_info.key != &spl_token::ID {
            return Err(QFError::UnexpectedTokenProgramID.into());
        }

        invoke(
            &spl_token::instruction::transfer_checked(
                &token_program_info.key,
                &from_info.key,
                &mint_info.key,
                &to_info.key,
                &from_auth_info.key,
                &[&from_auth_info.key],
                amount,
                decimals,
            )?,
            &[
                from_info.clone(),
                mint_info.clone(),
                to_info.clone(),
                from_auth_info.clone(),
                token_program_info.clone(),
            ],
        )?;
        round.area = round.area.checked_sub(project.area).unwrap();

        let mut project_area_sqrt = PreciseNumber {
            value: project.area_sqrt,
        };

        let new_votes_sqrt = PreciseNumber {
            value: U256::from(voter.votes.checked_add(amount).unwrap())
                .checked_mul(U256::from(ONE))
                .unwrap(),
        }
        .sqrt()
        .unwrap();

        project_area_sqrt = project_area_sqrt
            .checked_sub(&PreciseNumber {
                value: voter.votes_sqrt,
            })
            .unwrap()
            .checked_add(&new_votes_sqrt)
            .unwrap();
        project.area = project_area_sqrt.checked_pow(2).unwrap().value;

        round.area = round.area.checked_add(project.area).unwrap();
        Round::pack(round, &mut round_info.data.borrow_mut())?;

        project.area_sqrt = project_area_sqrt.value;
        project.votes = project.votes.checked_add(amount).unwrap();
        Project::pack(project, &mut project_info.data.borrow_mut())?;

        voter.votes = voter.votes.checked_add(amount).unwrap();
        voter.votes_sqrt = new_votes_sqrt.value;
        Voter::pack(voter, &mut voter_info.data.borrow_mut())?;

        Ok(())
    }

    pub fn process_withdraw(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let round_info = next_account_info(account_info_iter)?;
        let vault_info = next_account_info(account_info_iter)?;
        let vault_owner_info = next_account_info(account_info_iter)?;
        let project_info = next_account_info(account_info_iter)?;
        let project_owner_info = next_account_info(account_info_iter)?;
        let to_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;

        if round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut round = Round::unpack(&round_info.data.borrow())?;
        if round.status != RoundStatus::Finished {
            return Err(QFError::RoundStatusError.into());
        }

        if project_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut project = Project::unpack(&project_info.data.borrow())?;
        if project.round != *round_info.key {
            return Err(QFError::RoundMismatch.into());
        }
        if project.withdraw {
            return Err(QFError::ProjectAlreadyWithdraw.into());
        }
        if !project_owner_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        if project.owner != *project_owner_info.key {
            return Err(QFError::OwnerMismatch.into());
        }

        if token_program_info.key != &spl_token::ID {
            return Err(QFError::UnexpectedTokenProgramID.into());
        }

        let seeds: &[&[_]] = &[
            &round_info.key.to_bytes(),
            &[Pubkey::find_program_address(&[&round_info.key.to_bytes()], &program_id).1],
        ];

        let fund = U256::from(round.fund);
        let mut amount = project.votes;

        amount = amount
            .checked_add(
                fund.checked_mul(project.area)
                    .unwrap()
                    .checked_div(round.area)
                    .unwrap()
                    .as_u64(),
            )
            .unwrap();

        // charge 5% fee
        let fee = amount.checked_mul(5).unwrap().checked_div(100).unwrap();
        let amount = amount.checked_sub(fee).unwrap();

        invoke_signed(
            &spl_token::instruction::transfer(
                &token_program_info.key,
                &vault_info.key,
                &to_info.key,
                &vault_owner_info.key,
                &[&vault_owner_info.key],
                amount,
            )?,
            &[
                vault_info.clone(),
                to_info.clone(),
                vault_owner_info.clone(),
                token_program_info.clone(),
            ],
            &[&seeds],
        )?;

        project.withdraw = true;
        Project::pack(project, &mut project_info.data.borrow_mut())?;

        round.fee = round.fee.checked_add(fee).unwrap();
        Round::pack(round, &mut round_info.data.borrow_mut())?;

        Ok(())
    }

    pub fn process_end_round(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let round_info = next_account_info(account_info_iter)?;
        let owner_info = next_account_info(account_info_iter)?;

        if round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut round = Round::unpack(&round_info.data.borrow())?;
        if round.status != RoundStatus::Ongoing {
            return Err(QFError::RoundStatusError.into());
        }

        if owner_info.key != &round.owner {
            return Err(QFError::OwnerMismatch.into());
        }
        if !owner_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        round.status = RoundStatus::Finished;
        Round::pack(round, &mut round_info.data.borrow_mut())?;

        Ok(())
    }

    pub fn process_withdraw_fee(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let round_info = next_account_info(account_info_iter)?;
        let owner_info = next_account_info(account_info_iter)?;
        let vault_info = next_account_info(account_info_iter)?;
        let vault_owner_info = next_account_info(account_info_iter)?;
        let to_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;

        if round_info.owner != program_id {
            return Err(ProgramError::IncorrectProgramId);
        }
        let mut round = Round::unpack(&round_info.data.borrow())?;
        if round.status != RoundStatus::Finished {
            return Err(QFError::RoundStatusError.into());
        }
        if round.fee == 0 {
            return Err(ProgramError::InsufficientFunds);
        }

        if owner_info.key != &round.owner {
            return Err(QFError::OwnerMismatch.into());
        }
        if !owner_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        if vault_info.key != &round.vault {
            return Err(QFError::VaultMismatch.into());
        }

        if token_program_info.key != &spl_token::ID {
            return Err(QFError::UnexpectedTokenProgramID.into());
        }

        let seeds: &[&[_]] = &[
            &round_info.key.to_bytes(),
            &[Pubkey::find_program_address(&[&round_info.key.to_bytes()], &program_id).1],
        ];

        invoke_signed(
            &spl_token::instruction::transfer(
                &token_program_info.key,
                &vault_info.key,
                &to_info.key,
                &vault_owner_info.key,
                &[&vault_owner_info.key],
                round.fee,
            )?,
            &[
                vault_info.clone(),
                to_info.clone(),
                vault_owner_info.clone(),
                token_program_info.clone(),
            ],
            &[&seeds],
        )?;

        round.fee = 0;
        Round::pack(round, &mut round_info.data.borrow_mut())?;

        Ok(())
    }

    /// Processes an [Instruction](enum.Instruction.html).
    pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
        let instruction = QFInstruction::unpack(input)?;
        match instruction {
            QFInstruction::StartRound => {
                msg!("Instruction: StartRound");
                Self::process_start_round(program_id, accounts)
            }
            QFInstruction::Donate { amount, decimals } => {
                msg!("Instruction: Donate");
                Self::process_donate(program_id, accounts, amount, decimals)
            }
            QFInstruction::RegisterProject => {
                msg!("Instruction: RegisterProject");
                Self::process_register_project(program_id, accounts)
            }
            QFInstruction::InitVoter => {
                msg!("Instruction: InitVoter");
                Self::process_init_voter(program_id, accounts)
            }
            QFInstruction::Vote { amount, decimals } => {
                msg!("Instruction: Vote");
                Self::process_vote(program_id, accounts, amount, decimals)
            }
            QFInstruction::Withdraw => {
                msg!("Instruction: Withdraw");
                Self::process_withdraw(program_id, accounts)
            }
            QFInstruction::EndRound => {
                msg!("Instruction: EndRound");
                Self::process_end_round(program_id, accounts)
            }
            QFInstruction::WithdrawFee => {
                msg!("Instruction: WithdrawFee");
                Self::process_withdraw_fee(program_id, accounts)
            }
        }
    }
}

impl PrintProgramError for QFError {
    fn print<E>(&self)
    where
        E: 'static + std::error::Error + DecodeError<E> + PrintProgramError + FromPrimitive,
    {
        match self {
            QFError::OwnerMismatch => msg!("owner mismatch"),
            QFError::RoundStatusError => msg!("round status does not expected"),
            QFError::VaultMismatch => msg!("vault does not match"),
            QFError::RoundMismatch => msg!("round does not match"),
            QFError::ProjectAlreadyWithdraw => msg!("project has already withdraw"),
            QFError::UnexpectedSystemProgramID => msg!("unexpected system program id"),
            QFError::UnexpectedTokenProgramID => msg!("unexpected token program id"),
            QFError::UnexpectedAssociatedTokenAccountProgram => {
                msg!("unexpected asoociated token account program id")
            }
            QFError::VoterMismatch => msg!("voter mismatch"),
        }
    }
}
