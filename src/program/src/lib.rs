pub mod error;
pub mod instruction;
pub mod state;
pub mod processor;

#[cfg(not(feature = "no-entrypoint"))]
mod entrypoint;