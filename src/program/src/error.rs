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

    #[error("project has already withdraw")]
    ProjectAlreadyWithdraw,
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
