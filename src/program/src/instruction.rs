use solana_program::program_error::ProgramError;
use std::convert::TryInto;
use std::mem::size_of;

#[repr(C)]
#[derive(Debug)]
pub enum QFInstruction {
    StartRound,
    Donate { amount: u64, decimals: u8 },
    RegisterProject,
    InitVoter,
    Vote { amount: u64, decimals: u8 },
    Withdraw,
    EndRound,
    WithdrawFee,
}

impl QFInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (&tag, rest) = input
            .split_first()
            .ok_or(ProgramError::InvalidInstructionData)?;
        Ok(match tag {
            0 => Self::StartRound,
            1 | 4 => {
                let (amount, rest) = rest.split_at(8);
                let amount = amount
                    .try_into()
                    .ok()
                    .map(u64::from_le_bytes)
                    .ok_or(ProgramError::InvalidInstructionData)?;
                let (&decimals, _rest) = rest
                    .split_first()
                    .ok_or(ProgramError::InvalidInstructionData)?;
                match tag {
                    1 => Self::Donate { amount, decimals },
                    4 => Self::Vote { amount, decimals },
                    _ => unreachable!(),
                }
            }
            2 => Self::RegisterProject,
            3 => Self::InitVoter,
            5 => Self::Withdraw,
            6 => Self::EndRound,
            7 => Self::WithdrawFee,
            _ => return Err(ProgramError::InvalidInstructionData),
        })
    }

    pub fn pack(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(size_of::<Self>());
        match self {
            Self::StartRound => buf.push(0),
            &Self::Donate { amount, decimals } => {
                buf.push(1);
                buf.extend_from_slice(&amount.to_le_bytes());
                buf.push(decimals);
            }
            Self::RegisterProject => buf.push(2),
            Self::InitVoter => buf.push(3),
            &Self::Vote { amount, decimals } => {
                buf.push(4);
                buf.extend_from_slice(&amount.to_le_bytes());
                buf.push(decimals);
            }
            Self::Withdraw => buf.push(5),
            Self::EndRound => buf.push(6),
            Self::WithdrawFee => buf.push(7),
        };
        buf
    }
}
