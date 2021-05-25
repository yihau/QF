use num_derive::FromPrimitive;
use solana_program::{decode_error::DecodeError, program_error::ProgramError};
use thiserror::Error;

#[derive(Error, Debug, Clone, PartialEq, FromPrimitive)]
pub enum QFError {
    #[error("owner mismatch")]
    OwnerMismatch,

    #[error("round status does not expected")]
    RoundStatusError,

    #[error("vault does not match")]
    VaultMismatch,

    #[error("round does not match")]
    RoundMismatch,

    #[error("project has already withdraw")]
    ProjectAlreadyWithdraw,

    #[error("unexpected system program id")]
    UnexpectedSystemProgramID,

    #[error("unexpected token program id")]
    UnexpectedTokenProgramID,

    #[error("unexpected asoociated token account program id")]
    UnexpectedAssociatedTokenAccountProgram,

    #[error("voter mismatch")]
    VoterMismatch,
}
impl From<QFError> for ProgramError {
    fn from(e: QFError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
impl<E> DecodeError<E> for QFError {
    fn type_of() -> &'static str {
        "QFError"
    }
}
